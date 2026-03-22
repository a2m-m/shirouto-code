import * as vscode from 'vscode';
import { SidecarPanel, type CapabilityState } from './SidecarPanel';
import { TerminalOutputParser } from './TerminalOutputParser';
import { TranslationPseudoterminal } from './TranslationPseudoterminal';
import { explain, type CustomDangerRule } from './CommandExplainer';
import { summarize } from './ResultSummarizer';
import { Translator } from './Translator';
import { SecretMasker } from './SecretMasker';
import { HistoryStore } from './HistoryStore';
import { QuestionHandler, geminiErrorToMessage } from './QuestionHandler';
import { GeminiClient } from './GeminiClient';
import type { ParsedLine } from './TerminalOutputParser';
import { parseMarker } from './TerminalOutputParser';

const TRANSLATION_SESSION_NAME = 'シロートコード翻訳セッション';
const PTY_SESSION_NAME = 'シロートコード PTY セッション';

export function activate(context: vscode.ExtensionContext): void {
    const out = vscode.window.createOutputChannel('シロートコード');
    out.appendLine('[activate] 拡張機能が起動しました');
    context.subscriptions.push(out);
    vscode.window.showInformationMessage('シロートコード: 起動しました ✓');

    const provider = new SidecarPanel(context.extensionUri);
    const parser = new TerminalOutputParser();
    const historyStore = new HistoryStore(context.globalStorageUri);
    historyStore.load();
    historyStore.purgeExpired();
    const translator = new Translator();
    const questionHandler = new QuestionHandler();
    let managedTerminalProfile: vscode.Terminal | undefined;
    let managedPtyTerminal: vscode.Terminal | undefined;
    let activePty: TranslationPseudoterminal | undefined;
    let currentCommandLines: ParsedLine[] = [];
    let lastCommandLines: ParsedLine[] = [];

    // VS Code フォークではイベント間でターミナルオブジェクト参照が変わることがあるため
    // 参照比較に加えて名前でフォールバック比較する
    const isManagedTerminal = (t: vscode.Terminal): boolean =>
        t === managedTerminalProfile ||
        (managedTerminalProfile !== undefined && t.name === managedTerminalProfile.name) ||
        t === managedPtyTerminal;

    // Q&A: ユーザーの質問を Gemini に送信して回答を表示
    provider.onQuestion = (text: string) => {
        const snapshot = currentCommandLines.length > 0
            ? [...currentCommandLines]
            : [...lastCommandLines];

        const config = vscode.workspace.getConfiguration('shirouto-code');
        const enableAiSend = config.get<boolean>('enableAiSend', true);
        if (!enableAiSend) {
            provider.showAiAnswer('⚠ AI 送信が無効です（設定: shirouto-code.enableAiSend を有効にしてください）');
            return;
        }

        const masker = SecretMasker.fromConfig();
        let hasMasked = false;
        const maskedSnapshot = snapshot.map(l => {
            const { masked, hasMasked: m } = masker.mask(l.text);
            if (m) { hasMasked = true; }
            return { ...l, text: masked };
        });
        if (hasMasked) {
            provider.showMaskNotice();
        }

        provider.setAiLoading(true);
        questionHandler.handle(text, maskedSnapshot).then(({ answer, contextSnippet }) => {
            provider.showAiAnswer(answer, contextSnippet);
            historyStore.save({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                sessionId: (managedTerminalProfile ?? managedPtyTerminal)?.name ?? 'unknown',
                timestamp: Date.now(),
                question: text,
                answer
            });
        }).catch((err: unknown) => {
            provider.showAiAnswer(geminiErrorToMessage(err));
        }).finally(() => {
            provider.setAiLoading(false);
        });
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidecarPanel.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.openPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.shirouto-code');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.focusQuestionInput', () => {
            vscode.commands.executeCommand('workbench.view.extension.shirouto-code');
            provider.focusQuestionInput();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.selectModel', async () => {
            const config = vscode.workspace.getConfiguration('shirouto-code');
            const apiKey = config.get<string>('geminiApiKey', '');
            if (!apiKey || apiKey.trim() === '') {
                vscode.window.showErrorMessage(
                    'シロートコード: Gemini API キーが設定されていません。先に shirouto-code.geminiApiKey を設定してください。'
                );
                return;
            }
            const currentModel = config.get<string>('geminiModel', 'gemini-2.0-flash');
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'モデル一覧を取得中...', cancellable: false },
                async () => {
                    let models: string[];
                    try {
                        models = await GeminiClient.listModels(apiKey.trim());
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `シロートコード: ${err instanceof Error ? err.message : String(err)}`
                        );
                        return;
                    }
                    const items = models.map(m => ({
                        label: m,
                        description: m === currentModel ? '(現在選択中)' : undefined
                    }));
                    const picked = await vscode.window.showQuickPick(items, {
                        title: 'Gemini モデルを選択',
                        placeHolder: '使用するモデルを選んでください',
                    });
                    if (picked) {
                        await config.update('geminiModel', picked.label, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage(`シロートコード: モデルを ${picked.label} に変更しました。`);
                    }
                }
            );
        })
    );

    // 翻訳セッション起動コマンドの登録（コマンドパレット・sidecar ボタン共用）
    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.startSession', () => {
            if (managedTerminalProfile) {
                managedTerminalProfile.show();
                return;
            }
            const terminal = vscode.window.createTerminal({ name: TRANSLATION_SESSION_NAME });
            managedTerminalProfile = terminal;
            terminal.show();
        })
    );

    provider.onStartSession = () => vscode.commands.executeCommand('shirouto-code.startSession');

    // PTY 翻訳セッション起動コマンドの登録
    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.startPtySession', () => {
            // 既存の PTY セッションがあれば再利用（1対1バインドを維持）
            if (managedPtyTerminal) {
                managedPtyTerminal.show();
                return;
            }
            activePty = new TranslationPseudoterminal();
            const terminal = vscode.window.createTerminal({
                name: PTY_SESSION_NAME,
                pty: activePty
            });
            managedPtyTerminal = terminal;
            provider.updateSession(PTY_SESSION_NAME, 'pty');
            terminal.show();
        })
    );

    // 翻訳セッション Terminal Profile の登録
    context.subscriptions.push(
        vscode.window.registerTerminalProfileProvider('shirouto-code.translationSession', {
            provideTerminalProfile(
                _token: vscode.CancellationToken
            ): vscode.ProviderResult<vscode.TerminalProfile> {
                return new vscode.TerminalProfile({ name: TRANSLATION_SESSION_NAME });
            }
        })
    );

    // 管理対象ターミナルの追跡（プロファイル選択時に起動したターミナルを 1対1 でバインド）
    context.subscriptions.push(
        vscode.window.onDidOpenTerminal((terminal) => {
            if (terminal.name === TRANSLATION_SESSION_NAME) {
                managedTerminalProfile = terminal;
                provider.updateSession(terminal.name, 'profile');
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (!terminal) {
                return;
            }
            if (!managedTerminalProfile && !managedPtyTerminal) {
                return;
            }
            if (terminal === managedTerminalProfile ||
                (managedTerminalProfile !== undefined && terminal.name === managedTerminalProfile.name)) {
                provider.updateSession(terminal.name, 'profile');
            } else if (terminal === managedPtyTerminal) {
                provider.updateSession(terminal.name, 'pty');
            } else {
                provider.updateSession(null);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            if (terminal === managedTerminalProfile ||
                (managedTerminalProfile !== undefined && terminal.name === managedTerminalProfile.name)) {
                managedTerminalProfile = undefined;
                provider.updateSession(null);
            }
            if (terminal === managedPtyTerminal) {
                managedPtyTerminal = undefined;
                activePty?.dispose();
                activePty = undefined;
                provider.updateSession(null);
            }
        })
    );

    // ターミナル出力取得（proposed API: terminalDataWriteEvent）
    // VS Code 起動時に --enable-proposed-api a2m-m.shirouto-code が必要
    const win = vscode.window as unknown as {
        onDidWriteTerminalData?: (
            listener: (e: { terminal: vscode.Terminal; data: string }) => void
        ) => vscode.Disposable;
    };

    /** capability 状態を算出して sidecar に通知する */
    function notifyCapability(): void {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        const enableAiSend = config.get<boolean>('enableAiSend', true);
        const geminiApiKey = config.get<string>('geminiApiKey', '');
        let aiSend: CapabilityState['aiSend'];
        if (!enableAiSend) {
            aiSend = 'disabled';
        } else if (!geminiApiKey || geminiApiKey.trim() === '') {
            aiSend = 'no-key';
        } else {
            aiSend = 'available';
        }
        provider.updateCapability({
            terminalData: typeof win.onDidWriteTerminalData === 'function' ? 'available' : 'unavailable',
            shellIntegration: typeof vscode.window.onDidStartTerminalShellExecution === 'function' ? 'available' : 'unavailable',
            aiSend,
        });
    }

    notifyCapability();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('shirouto-code.enableAiSend') ||
                e.affectsConfiguration('shirouto-code.geminiApiKey')) {
                notifyCapability();
            }
        })
    );

    if (typeof win.onDidWriteTerminalData === 'function') {
        out.appendLine('[terminalData] API 利用可能');
        context.subscriptions.push(
            win.onDidWriteTerminalData((event) => {
                const managed = isManagedTerminal(event.terminal);
                out.appendLine(`[terminalData] fired terminal="${event.terminal.name}" managed=${managed}`);
                if (managed) {
                    vscode.window.showInformationMessage(`シロートコード: terminalData 受信 managed=${managed}`);
                }
                if (!managed) {
                    return;
                }

                // PTY セッション時: ZshHookInjector が埋め込んだマーカーでコマンド境界を検知
                // Shell Integration イベントが発火しない環境でも動作するためのフォールバック
                if (activePty !== undefined) {
                    const marker = parseMarker(event.data);
                    if (marker?.type === 'start') {
                        currentCommandLines = [];
                        parser.notifyCommandStart();
                        if (marker.command?.trim()) {
                            const customRules = vscode.workspace
                                .getConfiguration('shirouto-code')
                                .get<CustomDangerRule[]>('customDangerCommands', []);
                            provider.showCommandCard(explain(marker.command.trim(), customRules));
                        }
                    } else if (marker?.type === 'end') {
                        const boundary = parser.notifyCommandEnd(marker.exitCode);
                        if (boundary.type === 'end') {
                            provider.notifyCommandEnd(boundary.exitCode);
                        }
                        const flushed = parser.flush();
                        if (flushed.length > 0) {
                            currentCommandLines.push(...flushed);
                            provider.appendOutput(flushed);
                        }
                        const summary = summarize(currentCommandLines, marker.exitCode);
                        provider.showResultCard(summary);

                        const config = vscode.workspace.getConfiguration('shirouto-code');
                        const enableAiSend = config.get<boolean>('enableAiSend', true);
                        if (enableAiSend) {
                            const outputText = currentCommandLines.map(l => l.text).join('\n');
                            if (outputText.trim()) {
                                const { masked, hasMasked } = SecretMasker.fromConfig().mask(outputText);
                                if (hasMasked) {
                                    provider.showMaskNotice();
                                }
                                translator.translateBatch(masked).then(pair => {
                                    provider.showTranslation(pair);
                                }).catch(() => { /* 翻訳失敗は無視 */ });
                            }
                        }
                        lastCommandLines = [...currentCommandLines];
                        currentCommandLines = [];
                    }
                }

                // マーカーは ANSI_RE によって除去されるため、通常行の処理は常に実行する
                const lines = parser.push(event.data);
                if (lines.length > 0) {
                    currentCommandLines.push(...lines);
                    provider.appendOutput(lines);
                }
            })
        );
    }

    // コマンド境界検出（VS Code 1.90+: shell integration events）
    if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
        out.appendLine('[shellIntegration] API 利用可能');
        context.subscriptions.push(
            vscode.window.onDidStartTerminalShellExecution((e) => {
                const managed = isManagedTerminal(e.terminal);
                out.appendLine(`[shellIntegration] fired terminal="${e.terminal.name}" managed=${managed}`);
                vscode.window.showInformationMessage(`シロートコード: shellExec 受信 managed=${managed}`);
                if (!managed) {
                    return;
                }
                currentCommandLines = [];
                parser.notifyCommandStart();
                // コマンド解説カードを sidecar に表示
                const cmdLine = e.execution?.commandLine?.value;
                if (typeof cmdLine === 'string' && cmdLine.trim()) {
                    const customRules = vscode.workspace
                        .getConfiguration('shirouto-code')
                        .get<CustomDangerRule[]>('customDangerCommands', []);
                    provider.showCommandCard(explain(cmdLine, customRules));
                }
            })
        );
    }
    if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
        context.subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((e) => {
                if (!isManagedTerminal(e.terminal)) {
                    return;
                }
                const boundary = parser.notifyCommandEnd(e.exitCode);
                if (boundary.type === 'end') {
                    provider.notifyCommandEnd(boundary.exitCode);
                }
                const flushed = parser.flush();
                if (flushed.length > 0) {
                    currentCommandLines.push(...flushed);
                    provider.appendOutput(flushed);
                }
                // 実行後要約カードを表示
                const summary = summarize(currentCommandLines, e.exitCode);
                provider.showResultCard(summary);

                // コマンド出力を翻訳して sidecar に渡す（AI 送信前に秘密情報をマスキング）
                const config = vscode.workspace.getConfiguration('shirouto-code');
                const enableAiSend = config.get<boolean>('enableAiSend', true);
                if (enableAiSend) {
                    const outputText = currentCommandLines.map(l => l.text).join('\n');
                    if (outputText.trim()) {
                        const { masked, hasMasked } = SecretMasker.fromConfig().mask(outputText);
                        if (hasMasked) {
                            provider.showMaskNotice();
                        }
                        translator.translateBatch(masked).then(pair => {
                            provider.showTranslation(pair);
                        }).catch(() => { /* 翻訳失敗は無視 */ });
                    }
                }

                lastCommandLines = [...currentCommandLines];
                currentCommandLines = [];
            })
        );
    }
}

export function deactivate(): void {
    // cleanup if needed
}
