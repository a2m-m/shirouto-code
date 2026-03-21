import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface QAEntry {
    id: string;
    sessionId: string;
    timestamp: number;
    question: string;
    answer: string;
}

interface HistoryData {
    entries: QAEntry[];
}

const HISTORY_FILE = 'qa-history.json';

export class HistoryStore {
    private readonly filePath: string;
    private entries: QAEntry[] = [];

    constructor(globalStorageUri: vscode.Uri) {
        this.filePath = path.join(globalStorageUri.fsPath, HISTORY_FILE);
    }

    /** 起動時に履歴ファイルを読み込む。ファイルが存在しなければ空で開始。 */
    load(): QAEntry[] {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(this.filePath)) {
                return [];
            }
            const raw = fs.readFileSync(this.filePath, 'utf-8');
            const data: HistoryData = JSON.parse(raw);
            this.entries = Array.isArray(data.entries) ? data.entries : [];
        } catch {
            this.entries = [];
        }
        return this.entries;
    }

    /** エントリを追加してファイルに保存する。履歴保存が無効な場合は何もしない。 */
    save(entry: QAEntry): void {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        const enabled = config.get<boolean>('history.enabled', true);
        if (!enabled) {
            return;
        }
        this.entries.push(entry);
        this._persist();
    }

    /** 保持期間を超えたエントリを削除してファイルに保存する。 */
    purgeExpired(): void {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        const retentionDays = config.get<number>('history.retentionDays', 30);
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        const before = this.entries.length;
        this.entries = this.entries.filter(e => e.timestamp >= cutoff);
        if (this.entries.length !== before) {
            this._persist();
        }
    }

    /** 現在メモリ上にある全エントリを返す。 */
    getAll(): QAEntry[] {
        return this.entries;
    }

    /** 保存先パスを返す（ユーザーへの情報提示用）。 */
    getStoragePath(): string {
        return this.filePath;
    }

    private _persist(): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data: HistoryData = { entries: this.entries };
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch {
            // 書き込み失敗は無視（ストレージが利用不可の環境への配慮）
        }
    }
}
