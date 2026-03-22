import * as vscode from 'vscode';
import * as pty from 'node-pty';
import { ZshHookInjector } from './ZshHookInjector';
import { TerminalOutputParser, parseMarker, type ParsedLine } from './TerminalOutputParser';

/**
 * Pseudoterminal ベースの翻訳セッション。
 * node-pty で実際の zsh プロセスを起動し、I/O をブリッジする。
 * コマンド境界検知は ZshHookInjector が注入した preexec/precmd フックのマーカーで行う。
 * onDidWriteTerminalData に依存せず、node-pty の onData で直接処理する。
 */
export class TranslationPseudoterminal implements vscode.Pseudoterminal {
    private readonly _writeEmitter = new vscode.EventEmitter<string>();
    private readonly _closeEmitter = new vscode.EventEmitter<number | void>();
    private readonly _commandStartEmitter = new vscode.EventEmitter<string>();
    private readonly _commandEndEmitter = new vscode.EventEmitter<number | undefined>();
    private readonly _outputEmitter = new vscode.EventEmitter<ParsedLine[]>();

    readonly onDidWrite: vscode.Event<string> = this._writeEmitter.event;
    readonly onDidClose: vscode.Event<number | void> = this._closeEmitter.event;
    /** コマンド開始時に発火（コマンド文字列を渡す） */
    readonly onCommandStart: vscode.Event<string> = this._commandStartEmitter.event;
    /** コマンド終了時に発火（終了コードを渡す） */
    readonly onCommandEnd: vscode.Event<number | undefined> = this._commandEndEmitter.event;
    /** パース済み出力行が生成されたときに発火 */
    readonly onParsedOutput: vscode.Event<ParsedLine[]> = this._outputEmitter.event;

    private _pty: pty.IPty | undefined;
    private readonly _injector = new ZshHookInjector();
    private readonly _parser = new TerminalOutputParser();

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        const cols = initialDimensions?.columns ?? 80;
        const rows = initialDimensions?.rows ?? 24;

        try {
            const shell = process.env.SHELL ?? '/bin/zsh';
            this._pty = pty.spawn(shell, ['--interactive'], {
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
                // VS Code ターミナルへ表示用データを送る
                this._writeEmitter.fire(data);

                // マーカーを先にチェックしてコマンド境界を検知
                const marker = parseMarker(data);
                if (marker?.type === 'start') {
                    this._parser.notifyCommandStart();
                    this._commandStartEmitter.fire(marker.command?.trim() ?? '');
                } else if (marker?.type === 'end') {
                    this._parser.notifyCommandEnd(marker.exitCode);
                    const flushed = this._parser.flush();
                    if (flushed.length > 0) {
                        this._outputEmitter.fire(flushed);
                    }
                    this._commandEndEmitter.fire(marker.exitCode);
                }

                // 通常の出力行を処理（マーカーは ANSI_RE で除去される）
                const lines = this._parser.push(data);
                if (lines.length > 0) {
                    this._outputEmitter.fire(lines);
                }
            });

            this._pty.onExit(({ exitCode }) => {
                this._closeEmitter.fire(exitCode);
            });
        } catch (err) {
            const e = err as NodeJS.ErrnoException;
            const msg = `${e.message} (code=${e.code ?? '?'} errno=${e.errno ?? '?'})`;
            const shell = process.env.SHELL ?? '(undefined)';
            // child_process でスポーンできるか診断
            let cpTest = 'untested';
            try {
                const { spawnSync } = require('child_process') as typeof import('child_process');
                const r = spawnSync('/bin/zsh', ['--version'], { timeout: 2000 });
                cpTest = r.error ? `error: ${r.error.message}` : `ok: ${String(r.stdout).trim()}`;
            } catch (e2) {
                cpTest = `exception: ${e2}`;
            }
            this._writeEmitter.fire(
                'シロートコード: PTY セッションを起動できませんでした\r\n' +
                `SHELL=${shell}\r\n` +
                `node-pty エラー: ${msg}\r\n` +
                `child_process テスト: ${cpTest}\r\n`
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
        this._commandStartEmitter.dispose();
        this._commandEndEmitter.dispose();
        this._outputEmitter.dispose();
    }
}
