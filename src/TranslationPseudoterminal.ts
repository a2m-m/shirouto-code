import * as vscode from 'vscode';
import * as pty from 'node-pty';
import { ZshHookInjector } from './ZshHookInjector';

/**
 * Pseudoterminal ベースの翻訳セッション。
 * node-pty で実際の zsh プロセスを起動し、I/O をブリッジする。
 * コマンド境界検知は ZshHookInjector が注入した preexec/precmd フックのマーカーで行う。
 */
export class TranslationPseudoterminal implements vscode.Pseudoterminal {
    private readonly _writeEmitter = new vscode.EventEmitter<string>();
    private readonly _closeEmitter = new vscode.EventEmitter<number | void>();

    readonly onDidWrite: vscode.Event<string> = this._writeEmitter.event;
    readonly onDidClose: vscode.Event<number | void> = this._closeEmitter.event;

    private _pty: pty.IPty | undefined;
    private readonly _injector = new ZshHookInjector();

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        const cols = initialDimensions?.columns ?? 80;
        const rows = initialDimensions?.rows ?? 24;

        try {
            this._pty = pty.spawn('zsh', ['--interactive'], {
                name: 'xterm-256color',
                cols,
                rows,
                env: {
                    ...process.env as Record<string, string>,
                    ZDOTDIR: this._injector.zdotdir,
                    TERM: 'xterm-256color',
                }
            });

            this._pty.onData((data) => {
                this._writeEmitter.fire(data);
            });

            this._pty.onExit(({ exitCode }) => {
                this._closeEmitter.fire(exitCode);
            });
        } catch (err) {
            // node-pty が利用できない場合（ネイティブビルド未実施等）はフォールバックメッセージを表示
            const msg = err instanceof Error ? err.message : String(err);
            this._writeEmitter.fire(
                'シロートコード: PTY セッションを起動できませんでした\r\n' +
                `エラー: ${msg}\r\n` +
                'npm run rebuild を実行してから拡張を再起動してください。\r\n'
            );
        }
    }

    close(): void {
        this._pty?.kill();
        this._closeEmitter.fire();
    }

    handleInput(data: string): void {
        this._pty?.write(data);
    }

    setDimensions(dimensions: vscode.TerminalDimensions): void {
        this._pty?.resize(dimensions.columns, dimensions.rows);
    }

    /** 外部から文字列を書き込む（SidecarPanel 連携用） */
    write(text: string): void {
        this._writeEmitter.fire(text.replace(/\n/g, '\r\n'));
    }

    dispose(): void {
        this._pty?.kill();
        this._injector.dispose();
        this._writeEmitter.dispose();
        this._closeEmitter.dispose();
    }
}
