import * as vscode from 'vscode';
import { SidecarPanel } from './SidecarPanel';
import { TerminalOutputParser } from './TerminalOutputParser';
import { TranslationPseudoterminal } from './TranslationPseudoterminal';
import { explain, type CustomDangerRule } from './CommandExplainer';
import { summarize } from './ResultSummarizer';
import { Translator } from './Translator';
import { SecretMasker } from './SecretMasker';
import { HistoryStore } from './HistoryStore';
import { QuestionHandler, geminiErrorToMessage } from './QuestionHandler';
import type { ParsedLine } from './TerminalOutputParser';

const TRANSLATION_SESSION_NAME = 'シロートコード翻訳セッション';
const PTY_SESSION_NAME = 'シロートコード PTY セッション';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidecarPanel(context.extensionUri);
    const parser = new TerminalOutputParser();
    const historyStore = new HistoryStore(context.globalStorageUri);
    historyStore.load();
    historyStore.purgeExpired();
    const translator = new Translator();
    const questionHandler = new QuestionHandler();
    let managedTerminal: vscode.Terminal | undefined;
    let activePty: TranslationPseudoterminal | undefined;
    let currentCommandLines: ParsedLine[] = [];

    // VS Code フォークではイベント間でターミナルオブジェクト参照が変わることがあるため
    // 参照比較に加えて名前でフォールバック比較する
    const isManagedTerminal = (t: vscode.Terminal): boolean =>
        t === managedTerminal || (managedTerminal !== undefined && t.name === managedTerminal.name);

    // Q&A: ユーザーの質問を Gemini に送信して回答を表示
    provider.onQuestion = (text: string) => {
        const snapshot = [...currentCommandLines];
        provider.setAiLoading(true);
        questionHandler.handle(text, snapshot).then(({ answer, contextSnippet }) => {
            provider.showAiAnswer(answer, contextSnippet);
            historyStore.save({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                sessionId: managedTerminal?.name ?? 'unknown',
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

    // PTY 翻訳セッション起動コマンドの登録
    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.startPtySession', () => {
            // 既存の PTY セッションがあれば再利用（1対1バインドを維持）
            if (managedTerminal) {
                managedTerminal.show();
                return;
            }
            activePty = new TranslationPseudoterminal();
            const terminal = vscode.window.createTerminal({
                name: PTY_SESSION_NAME,
                pty: activePty
            });
            managedTerminal = terminal;
            provider.updateSession(PTY_SESSION_NAME);
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
                managedTerminal = terminal;
                provider.updateSession(terminal.name);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (!managedTerminal || !terminal) {
                return;
            }
            if (isManagedTerminal(terminal)) {
                provider.updateSession(terminal.name);
            } else {
                provider.updateSession(null);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            if (isManagedTerminal(terminal)) {
                managedTerminal = undefined;
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
    if (typeof win.onDidWriteTerminalData === 'function') {
        context.subscriptions.push(
            win.onDidWriteTerminalData((event) => {
                if (!isManagedTerminal(event.terminal)) {
                    return;
                }
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
        context.subscriptions.push(
            vscode.window.onDidStartTerminalShellExecution((e) => {
                if (!isManagedTerminal(e.terminal)) {
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

                currentCommandLines = [];
            })
        );
    }
}

export function deactivate(): void {
    // cleanup if needed
}
