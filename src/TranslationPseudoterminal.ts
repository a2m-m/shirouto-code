import * as vscode from 'vscode';

/**
 * Pseudoterminal ベースの翻訳セッション。
 * 拡張が入出力を完全にコントロールする。
 */
export class TranslationPseudoterminal implements vscode.Pseudoterminal {
    private readonly _writeEmitter = new vscode.EventEmitter<string>();
    private readonly _closeEmitter = new vscode.EventEmitter<number | void>();

    readonly onDidWrite: vscode.Event<string> = this._writeEmitter.event;
    readonly onDidClose: vscode.Event<number | void> = this._closeEmitter.event;

    open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
        this._writeEmitter.fire('シロートコード 翻訳セッション へようこそ\r\n');
        this._writeEmitter.fire('コマンドを入力してください...\r\n');
    }

    close(): void {
        this._closeEmitter.fire();
    }

    handleInput(data: string): void {
        // 入力をそのままエコーバック（後続 Issue でコマンド解析に置き換える）
        this._writeEmitter.fire(data === '\r' ? '\r\n' : data);
    }

    /** 外部から出力行を書き込む（SidecarPanel 連携用） */
    write(text: string): void {
        this._writeEmitter.fire(text.replace(/\n/g, '\r\n'));
    }

    dispose(): void {
        this._writeEmitter.dispose();
        this._closeEmitter.dispose();
    }
}
