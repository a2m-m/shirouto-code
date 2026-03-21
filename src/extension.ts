import * as vscode from 'vscode';
import { SidecarPanel } from './SidecarPanel';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidecarPanel(context.extensionUri);

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
}

export function deactivate(): void {
    // cleanup if needed
}
