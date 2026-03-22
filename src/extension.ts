import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SidecarPanel } from './SidecarPanel';
import { TranslationPseudoterminal } from './TranslationPseudoterminal';
import { explain, type CustomDangerRule } from './CommandExplainer';
import { summarize } from './ResultSummarizer';
import { Translator } from './Translator';
import { SecretMasker } from './SecretMasker';
import { HistoryStore } from './HistoryStore';
import { QuestionHandler, geminiErrorToMessage } from './QuestionHandler';
import { GeminiClient } from './GeminiClient';
import type { ParsedLine } from './TerminalOutputParser';

const PTY_SESSION_NAME = 'シロートコード PTY セッション';

export function activate(context: vscode.ExtensionContext): void {
    // VSIX (ZIP) はファイルパーミッションを保持しないため、
    // node-pty の spawn-helper に実行権限を付与する（macOS のみ必要）
    if (process.platform === 'darwin') {
        try {
            const spawnHelper = path.join(
                context.extensionPath,
                'node_modules', 'node-pty', 'prebuilds',
                `${process.platform}-${process.arch}`,
                'spawn-helper'
            );
            if (fs.existsSync(spawnHelper)) {
                fs.chmodSync(spawnHelper, 0o755);
            }
        } catch (_) { /* 権限付与失敗は無視 */ }
    }

    const provider = new SidecarPanel(context.extensionUri);
    const historyStore = new HistoryStore(context.globalStorageUri);
    historyStore.load();
    historyStore.purgeExpired();
    const translator = new Translator();
    const questionHandler = new QuestionHandler();
    let managedPtyTerminal: vscode.Terminal | undefined;
    let activePty: TranslationPseudoterminal | undefined;
    let ptySubscriptions: vscode.Disposable[] = [];
    let currentCommandLines: ParsedLine[] = [];
    let lastCommandLines: ParsedLine[] = [];

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
                sessionId: managedPtyTerminal?.name ?? 'unknown',
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
            const currentModel = config.get<string>('geminiModel', 'gemini-2.0-flash-lite');
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

    // PTY 翻訳セッション起動コマンドの登録
    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.startPtySession', () => {
            // 既存の PTY セッションがあれば再利用（1対1バインドを維持）
            if (managedPtyTerminal) {
                managedPtyTerminal.show();
                return;
            }
            activePty = new TranslationPseudoterminal();

            // PTY 内部イベントを購読
            ptySubscriptions = [
                activePty.onCommandStart((command) => {
                    currentCommandLines = [];
                    if (command.trim()) {
                        const customRules = vscode.workspace
                            .getConfiguration('shirouto-code')
                            .get<CustomDangerRule[]>('customDangerCommands', []);
                        provider.showCommandCard(explain(command, customRules));
                    }
                }),
                activePty.onParsedOutput((lines) => {
                    currentCommandLines.push(...lines);
                    provider.appendOutput(lines);
                }),
                activePty.onCommandEnd((exitCode) => {
                    provider.notifyCommandEnd(exitCode);
                    const summary = summarize(currentCommandLines, exitCode);
                    provider.showResultCard(summary);

                    const config = vscode.workspace.getConfiguration('shirouto-code');
                    const enableAiSend = config.get<boolean>('enableAiSend', true);
                    if (enableAiSend) {
                        const outputText = currentCommandLines.map(l => l.text).join('\n');
                        if (outputText.trim()) {
                            const { masked, hasMasked } = SecretMasker.fromConfig().mask(outputText);
                            if (hasMasked) { provider.showMaskNotice(); }
                            translator.translateBatch(masked).then(pair => {
                                provider.showTranslation(pair);
                            }).catch(() => { /* 翻訳失敗は無視 */ });
                        }
                    }
                    lastCommandLines = [...currentCommandLines];
                    currentCommandLines = [];
                }),
            ];

            const terminal = vscode.window.createTerminal({
                name: PTY_SESSION_NAME,
                pty: activePty
            });
            managedPtyTerminal = terminal;
            provider.updateSession(PTY_SESSION_NAME);
            terminal.show();
        })
    );

    provider.onStartSession = () => vscode.commands.executeCommand('shirouto-code.startPtySession');

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (!terminal || !managedPtyTerminal) {
                return;
            }
            if (terminal === managedPtyTerminal) {
                provider.updateSession(terminal.name);
            } else {
                provider.updateSession(null);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            if (terminal === managedPtyTerminal) {
                managedPtyTerminal = undefined;
                activePty?.dispose();
                activePty = undefined;
                for (const sub of ptySubscriptions) { sub.dispose(); }
                ptySubscriptions = [];
                provider.updateSession(null);
            }
        })
    );

    /** capability 状態を算出して sidecar に通知する */
    function notifyCapability(): void {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        const enableAiSend = config.get<boolean>('enableAiSend', true);
        const geminiApiKey = config.get<string>('geminiApiKey', '');
        let aiSend: 'available' | 'no-key' | 'disabled';
        if (!enableAiSend) {
            aiSend = 'disabled';
        } else if (!geminiApiKey || geminiApiKey.trim() === '') {
            aiSend = 'no-key';
        } else {
            aiSend = 'available';
        }
        provider.updateCapability({ aiSend });
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
}

export function deactivate(): void {
    // cleanup if needed
}
