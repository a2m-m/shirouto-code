import * as vscode from 'vscode';
import { SidecarPanel } from './SidecarPanel';
import { TerminalOutputParser } from './TerminalOutputParser';
import { TranslationPseudoterminal } from './TranslationPseudoterminal';

const TRANSLATION_SESSION_NAME = 'シロートコード翻訳セッション';
const PTY_SESSION_NAME = 'シロートコード PTY セッション';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidecarPanel(context.extensionUri);
    const parser = new TerminalOutputParser();
    let managedTerminal: vscode.Terminal | undefined;
    let activePty: TranslationPseudoterminal | undefined;

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidecarPanel.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.openPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.shirouto-code');
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
            if (!managedTerminal) {
                return;
            }
            if (terminal === managedTerminal) {
                provider.updateSession(terminal.name);
            } else {
                provider.updateSession(null);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            if (terminal === managedTerminal) {
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
                if (event.terminal !== managedTerminal) {
                    return;
                }
                const lines = parser.push(event.data);
                if (lines.length > 0) {
                    provider.appendOutput(lines);
                }
            })
        );
    }

    // コマンド境界検出（VS Code 1.90+: shell integration events）
    if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
        context.subscriptions.push(
            vscode.window.onDidStartTerminalShellExecution((e) => {
                if (e.terminal !== managedTerminal) {
                    return;
                }
                parser.notifyCommandStart();
            })
        );
    }
    if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
        context.subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal !== managedTerminal) {
                    return;
                }
                const boundary = parser.notifyCommandEnd(e.exitCode);
                if (boundary.type === 'end') {
                    provider.notifyCommandEnd(boundary.exitCode);
                }
                const flushed = parser.flush();
                if (flushed.length > 0) {
                    provider.appendOutput(flushed);
                }
            })
        );
    }
}

export function deactivate(): void {
    // cleanup if needed
}
