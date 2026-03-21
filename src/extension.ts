import * as vscode from 'vscode';
import { SidecarPanel } from './SidecarPanel';
import { TerminalOutputParser } from './TerminalOutputParser';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidecarPanel(context.extensionUri);
    const parser = new TerminalOutputParser();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidecarPanel.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('shirouto-code.openPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.shirouto-code');
        })
    );

    // ターミナルセッション監視
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            provider.updateSession(terminal?.name ?? null);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal(() => {
            const active = vscode.window.activeTerminal;
            provider.updateSession(active?.name ?? null);
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
            vscode.window.onDidStartTerminalShellExecution(() => {
                parser.notifyCommandStart();
            })
        );
    }
    if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
        context.subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((e) => {
                const boundary = parser.notifyCommandEnd(e.exitCode);
                if (boundary.type === 'end') {
                    provider.notifyCommandEnd(boundary.exitCode);
                }
                // コマンド終了時にバッファをフラッシュ
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
