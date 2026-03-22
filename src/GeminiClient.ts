import * as vscode from 'vscode';

const GEMINI_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/** API キー未設定エラーをこのセッションで既に通知済みかどうか */
let apiKeyErrorShown = false;

/** テスト用: API キー未設定通知フラグをリセットする */
export function resetApiKeyErrorFlag(): void {
    apiKeyErrorShown = false;
}

export class GeminiError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'GeminiError';
    }
}

export class GeminiClient {
    private getApiKey(): string {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        const key = config.get<string>('geminiApiKey');
        if (!key || key.trim() === '') {
            if (!apiKeyErrorShown) {
                apiKeyErrorShown = true;
                vscode.window.showErrorMessage(
                    'シロートコード: Gemini API キーが設定されていません。設定 → shirouto-code.geminiApiKey を確認してください。'
                );
            }
            throw new GeminiError('Gemini API キーが未設定です');
        }
        // キーが設定されたらフラグをリセット（設定変更後に再通知できるよう）
        apiKeyErrorShown = false;
        return key.trim();
    }

    async chat(prompt: string): Promise<string> {
        const apiKey = this.getApiKey();

        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        });

        let response: Response;
        try {
            response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: AbortSignal.timeout(30_000)
            });
        } catch (err) {
            const message =
                err instanceof Error && err.name === 'TimeoutError'
                    ? 'Gemini API タイムアウト（30秒）'
                    : `Gemini API 通信エラー: ${err instanceof Error ? err.message : String(err)}`;
            throw new GeminiError(message);
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            if (response.status === 429) {
                throw new GeminiError('Gemini API レートリミットに達しました。しばらく待ってから再試行してください。', 429);
            }
            throw new GeminiError(
                `Gemini API エラー (HTTP ${response.status}): ${detail}`,
                response.status
            );
        }

        const json = await response.json() as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
        };

        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== 'string') {
            throw new GeminiError('Gemini API レスポンスのフォーマットが不正です');
        }
        return text;
    }
}
