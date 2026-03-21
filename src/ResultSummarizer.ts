import type { ParsedLine } from './TerminalOutputParser';

/** 実行後要約 */
export interface ResultSummary {
    /** 終了コード */
    exitCode?: number;
    /** 成功フラグ（exitCode === 0 または undefined） */
    success: boolean;
    /** 重要行（最大 3 行） */
    keyPoints: string[];
    /** エラー原因候補（失敗時のみ） */
    errorCauses: string[];
    /** 次の候補アクション */
    nextActions: string[];
}

// --- よくあるエラーパターン ---
const ERROR_PATTERNS: { pattern: RegExp; cause: string; action: string }[] = [
    {
        pattern: /command not found|コマンドが見つかりません/i,
        cause: 'コマンドがインストールされていないか、PATH に含まれていません。',
        action: '`which <コマンド名>` でインストール場所を確認するか、パッケージマネージャーでインストールしてください。',
    },
    {
        pattern: /permission denied|操作は許可されていません/i,
        cause: 'ファイルやディレクトリへのアクセス権限がありません。',
        action: '`ls -la` で権限を確認し、必要なら `chmod` で変更するか `sudo` を付けて実行してください。',
    },
    {
        pattern: /no such file or directory|そのようなファイルやディレクトリはありません/i,
        cause: '指定したファイルまたはディレクトリが存在しません。',
        action: '`ls` でファイル名・パスを確認し、スペルミスがないか見直してください。',
    },
    {
        pattern: /cannot allocate memory|out of memory|OOM/i,
        cause: 'メモリが不足しています。',
        action: '他のアプリを閉じてメモリを解放するか、処理対象のデータサイズを小さくしてください。',
    },
    {
        pattern: /connection refused|接続が拒否されました/i,
        cause: '接続先のサーバーが起動していないか、ポートが閉じられています。',
        action: 'サーバーが起動しているか、ポート番号・ホスト名が正しいか確認してください。',
    },
    {
        pattern: /network unreachable|name or service not known|resolve.*failed/i,
        cause: 'ネットワークに接続できていません。',
        action: 'インターネット接続を確認してください。VPN 使用中の場合は接続状態を確認してください。',
    },
    {
        pattern: /syntax error|SyntaxError/i,
        cause: 'コードやコマンドの文法が間違っています。',
        action: 'エラー行の前後を見直し、括弧・クォート・セミコロンの対応を確認してください。',
    },
    {
        pattern: /disk.*full|no space left/i,
        cause: 'ディスクの空き容量がありません。',
        action: '`df -h` でディスク使用状況を確認し、不要なファイルを削除してください。',
    },
    {
        pattern: /killed|signal 9|SIGKILL/i,
        cause: 'プロセスが強制終了されました（メモリ不足または手動停止）。',
        action: 'メモリ使用量を確認するか、処理を分割して再実行してください。',
    },
    {
        pattern: /timeout|timed out/i,
        cause: '処理がタイムアウトしました。',
        action: 'ネットワーク接続や処理対象の規模を確認してください。',
    },
];

/**
 * コマンド実行後の出力行と終了コードから要約を生成する。
 */
export function summarize(lines: ParsedLine[], exitCode?: number): ResultSummary {
    const success = exitCode === undefined || exitCode === 0;

    // --- keyPoints: error > ai-notice > confirm > log の優先順で最大 3 行 ---
    const priority = ['error', 'ai-notice', 'confirm', 'log'] as const;
    const byKind: Record<string, ParsedLine[]> = {};
    for (const line of lines) {
        if (!byKind[line.kind]) {
            byKind[line.kind] = [];
        }
        byKind[line.kind].push(line);
    }

    const keyPoints: string[] = [];
    for (const kind of priority) {
        if (keyPoints.length >= 3) {
            break;
        }
        const bucket = byKind[kind] ?? [];
        // 同 kind から最大 (3 - keyPoints.length) 行取得（末尾優先：最後のエラーが重要）
        const remaining = 3 - keyPoints.length;
        const picked = bucket.slice(-remaining);
        for (const l of picked) {
            if (keyPoints.length < 3) {
                keyPoints.push(l.text);
            }
        }
    }

    // --- errorCauses / nextActions: 失敗時のみパターンマッチ ---
    const errorCauses: string[] = [];
    const nextActions: string[] = [];

    if (!success) {
        const errorTexts = lines
            .filter(l => l.kind === 'error')
            .map(l => l.text)
            .join('\n');

        // マッチしたパターンから重複なしで収集
        const matchedCauses = new Set<string>();
        const matchedActions = new Set<string>();
        for (const rule of ERROR_PATTERNS) {
            if (rule.pattern.test(errorTexts)) {
                matchedCauses.add(rule.cause);
                matchedActions.add(rule.action);
            }
        }

        errorCauses.push(...matchedCauses);
        nextActions.push(...matchedActions);

        // パターン不明の場合のデフォルト
        if (errorCauses.length === 0) {
            errorCauses.push('詳細なエラー内容はログを確認してください。');
            nextActions.push('上のログに表示されたエラーメッセージをそのまま検索エンジンで調べてみましょう。');
        }
    }

    return { exitCode, success, keyPoints, errorCauses, nextActions };
}
