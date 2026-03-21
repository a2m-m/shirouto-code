import { GeminiClient, GeminiError } from './GeminiClient';
import type { ParsedLine } from './TerminalOutputParser';

/** 確認メッセージのパターンと日本語ガイドのマッピング */
const CONFIRM_PATTERNS: { pattern: RegExp; guide: string }[] = [
    {
        pattern: /Proceed with running this command\?/i,
        guide: '⚠ Claude Code がコマンドの実行確認を求めています。\n  • 実行する → y または yes を入力して Enter\n  • キャンセル → n または no を入力して Enter'
    },
    {
        pattern: /Do you want to proceed\?/i,
        guide: '⚠ 続行するか確認が求められています。\n  • 続行 → y を入力して Enter\n  • 中止 → n を入力して Enter'
    },
    {
        pattern: /Are you sure\?/i,
        guide: '⚠ 本当に実行してよいか確認が求められています。\n  • 確認 → y を入力して Enter\n  • キャンセル → n を入力して Enter'
    },
    {
        pattern: /\(y\/n\)/i,
        guide: '⚠ 確認プロンプトです。\n  • はい → y を入力して Enter\n  • いいえ → n を入力して Enter'
    },
    {
        pattern: /\(yes\/no\)/i,
        guide: '⚠ 確認プロンプトです。\n  • はい → yes を入力して Enter\n  • いいえ → no を入力して Enter'
    },
];

/** 直近コンテキストとして使う最大行数 */
const MAX_CONTEXT_LINES = 50;

export class QuestionHandler {
    private readonly gemini = new GeminiClient();

    /**
     * ユーザーの質問を受け取り、コンテキストを付加して Gemini に送信する。
     * @returns { answer, contextSnippet } — UI に渡す回答とコンテキスト要約
     */
    async handle(
        question: string,
        contextLines: ParsedLine[]
    ): Promise<{ answer: string; contextSnippet: string | undefined }> {
        // 確認メッセージの検知（コンテキストに含まれているか質問テキストに含まれるか）
        const allText = contextLines.map(l => l.text).join('\n') + '\n' + question;
        for (const { pattern, guide } of CONFIRM_PATTERNS) {
            if (pattern.test(allText)) {
                return { answer: guide, contextSnippet: undefined };
            }
        }

        // 直近コンテキストを構築（行数超過は古い方を切り捨て）
        const recent = contextLines.slice(-MAX_CONTEXT_LINES);
        const contextText = recent.map(l => l.text).join('\n').trim();
        const contextSnippet = contextText
            ? contextText.slice(0, 80).replace(/\n/g, ' ') + (contextText.length > 80 ? '…' : '')
            : undefined;

        const prompt = this._buildPrompt(question, contextText);
        const answer = await this.gemini.chat(prompt);
        return { answer, contextSnippet };
    }

    private _buildPrompt(question: string, contextText: string): string {
        const contextSection = contextText
            ? `## 直近のターミナル出力（コンテキスト）\n\`\`\`\n${contextText}\n\`\`\`\n\n`
            : '';

        return `あなたはターミナル作業をサポートする AI アシスタントです。
初心者ユーザーが安全にコマンドを実行できるよう、わかりやすく日本語で回答してください。

ルール：
- 断定を避け、推測や可能性がある場合は「〜と思われます」「〜の可能性があります」のように明示すること
- コマンドの意味・オプション・エラー理由・次にやるべき操作を簡潔に答えること
- 危険な操作には必ず警告を添えること
- 回答は日本語で、200文字以内を目安にすること

${contextSection}## ユーザーの質問
${question}`;
    }
}

/** GeminiError を UI 向けエラーメッセージに変換する */
export function geminiErrorToMessage(err: unknown): string {
    if (err instanceof GeminiError) {
        return `⚠ ${err.message}`;
    }
    return `⚠ 予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;
}
