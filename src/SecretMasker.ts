import * as vscode from 'vscode';

export interface MaskResult {
    masked: string;
    hasMasked: boolean;
}

const MASK_TOKEN = '[MASKED]';

/** 組み込み秘密情報検知パターン */
const BUILT_IN_PATTERNS: RegExp[] = [
    // Authorization / Bearer ヘッダー
    /\b(?:Authorization|authorization)\s*:\s*\S+/g,
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    // AWS アクセスキー・シークレット
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\b(?:aws[_-]?secret[_-]?access[_-]?key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*\S+/gi,
    // OpenAI / Anthropic スタイルの API キー
    /\bsk-[A-Za-z0-9]{20,}\b/g,
    // 汎用 API キー・シークレット
    /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*\S+/gi,
    // パスワード・シークレット・トークン
    /\b(?:password|passwd|pwd|secret|token)\s*[=:]\s*\S+/gi,
    // Cookie ヘッダー値
    /\bCookie\s*:\s*.+/gi,
    // PEM 形式の秘密鍵ブロック
    /-----BEGIN [A-Z ]+KEY-----[\s\S]*?-----END [A-Z ]+KEY-----/g,
];

/**
 * ターミナル出力から秘密情報を検知し、AI 送信前にマスキングするクラス。
 * 組み込みパターンに加え、ユーザー定義の正規表現パターンも適用する。
 */
export class SecretMasker {
    private readonly userPatterns: RegExp[];

    constructor(userPatternStrings: string[] = []) {
        this.userPatterns = userPatternStrings.flatMap(p => {
            try {
                return [new RegExp(p, 'g')];
            } catch {
                // 無効な正規表現は無視する
                return [];
            }
        });
    }

    /** テキスト中の秘密情報を [MASKED] に置換する */
    mask(text: string): MaskResult {
        let masked = text;
        let hasMasked = false;

        for (const pattern of [...BUILT_IN_PATTERNS, ...this.userPatterns]) {
            const replaced = masked.replace(pattern, MASK_TOKEN);
            if (replaced !== masked) {
                hasMasked = true;
                masked = replaced;
            }
        }

        return { masked, hasMasked };
    }

    /** VS Code 設定からユーザー定義パターンを読み込んで SecretMasker を生成する */
    static fromConfig(): SecretMasker {
        const patterns = vscode.workspace
            .getConfiguration('shirouto-code')
            .get<string[]>('customSecretPatterns', []);
        return new SecretMasker(patterns);
    }
}
