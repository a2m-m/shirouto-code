/** ターミナル出力の種別 */
export type OutputKind =
    | 'log'       // 通常ログ
    | 'error'     // エラー
    | 'confirm'   // 確認メッセージ
    | 'ai-notice' // AI エージェントの注意文
    | 'command';  // ユーザー入力コマンド

/** パース済み1行 */
export interface ParsedLine {
    /** ANSI除去済みテキスト */
    text: string;
    /** 出力種別 */
    kind: OutputKind;
}

/** コマンド境界イベント */
export type BoundaryEvent = { type: 'start' } | { type: 'end'; exitCode?: number };

// ANSI エスケープシーケンス（色・カーソル移動・消去等）
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[PX^_].*?\x9c|\x1b[^[\]]/g;

// 制御文字（CR / バックスペースなど）
const CTRL_RE = /[\r\x08]/g;

/** ANSI エスケープシーケンスと制御文字を除去する */
export function stripAnsi(raw: string): string {
    return raw.replace(ANSI_RE, '').replace(CTRL_RE, '');
}

// 種別判定パターン
const COMMAND_RE = /^[\s]*[$%>#❯]\s/;
const ERROR_RE = /\b(error|Error|ERROR|fatal|FATAL|exception|Exception)\b|✗|✘|\bfailed\b|\bFailed\b|\bFAILED\b/;
const CONFIRM_RE = /\[Y\/n\]|\[y\/N\]|\[y\/n\]|\[Y\/N\]|\?\s|Are you sure|続けますか|よろしいですか/i;
const AI_NOTICE_RE = /╭─|╰─|│|⚠|⚠️|Warning:|Note:|NOTICE:|Caution:/;

/** テキスト1行の種別を判定する */
export function classifyLine(text: string): OutputKind {
    if (COMMAND_RE.test(text)) { return 'command'; }
    if (CONFIRM_RE.test(text)) { return 'confirm'; }
    if (AI_NOTICE_RE.test(text)) { return 'ai-notice'; }
    if (ERROR_RE.test(text)) { return 'error'; }
    return 'log';
}

/**
 * ターミナル出力パーサー。
 * 生のターミナルデータ（改行込み）を受け取り、行ごとにパース・分類する。
 */
export class TerminalOutputParser {
    /** 未処理の断片バッファ（改行で区切られていない末尾の残り） */
    private _buffer = '';

    /** シェルインテグレーションの境界検出で使うコマンド実行中フラグ */
    private _inCommand = false;

    /**
     * 生データを投入してパース済み行を返す。
     * VS Code の `onDidWriteTerminalData` イベントから受け取ったデータをそのまま渡す。
     */
    push(raw: string): ParsedLine[] {
        const combined = this._buffer + raw;
        const lines = combined.split('\n');

        // 最後の要素は改行未確定の断片としてバッファに残す
        this._buffer = lines.pop() ?? '';

        return lines
            .map(line => stripAnsi(line).trimEnd())
            .filter(text => text.length > 0)
            .map(text => ({ text, kind: classifyLine(text) }));
    }

    /**
     * バッファに残った未改行データを強制フラッシュする。
     * コマンド終了時など区切りが確定した際に呼ぶ。
     */
    flush(): ParsedLine[] {
        if (!this._buffer) { return []; }
        const text = stripAnsi(this._buffer).trimEnd();
        this._buffer = '';
        if (!text) { return []; }
        return [{ text, kind: classifyLine(text) }];
    }

    /** コマンド開始境界を通知する */
    notifyCommandStart(): BoundaryEvent {
        this._inCommand = true;
        return { type: 'start' };
    }

    /** コマンド終了境界を通知する */
    notifyCommandEnd(exitCode?: number): BoundaryEvent {
        this._inCommand = false;
        return { type: 'end', exitCode };
    }

    get inCommand(): boolean {
        return this._inCommand;
    }
}
