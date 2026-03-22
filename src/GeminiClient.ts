import * as vscode from 'vscode';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash-lite';

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
    private getModel(): string {
        const config = vscode.workspace.getConfiguration('shirouto-code');
        return config.get<string>('geminiModel', DEFAULT_MODEL) || DEFAULT_MODEL;
    }

    static async listModels(apiKey: string): Promise<string[]> {
        const url = `${GEMINI_API_BASE}/models?key=${apiKey}`;
        let response: Response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        } catch (err) {
            throw new GeminiError(`モデル一覧取得エラー: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new GeminiError(`モデル一覧取得失敗 (HTTP ${response.status}): ${detail}`, response.status);
        }
        const json = await response.json() as {
            models?: { name?: string; supportedGenerationMethods?: string[] }[];
        };
        return (json.models ?? [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name?.replace('models/', '') ?? '')
            .filter(Boolean);
    }

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

        const model = this.getModel();
        const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

        let response: Response;
        try {
            response = await fetch(`${url}?key=${apiKey}`, {
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
