import { GeminiClient } from './GeminiClient';
import localDictionary from './data/localDictionary.json';

export interface TranslationPair {
    original: string;
    translated: string;
}

interface DictionaryEntry {
    pattern: string;
    translation: string;
    regex: boolean;
}

const DICT: DictionaryEntry[] = localDictionary as DictionaryEntry[];

/**
 * 辞書置換後のテキストに未翻訳の英語長文が残っているか判定する。
 * ASCII 単語（2文字以上）が3つ以上連続している場合を「有意な英語」とみなす。
 */
function hasSignificantEnglish(text: string): boolean {
    return /(?:^|[ \t])([A-Za-z]{2,}[ \t]){3,}[A-Za-z]{2,}/m.test(text);
}

export class Translator {
    private readonly gemini: GeminiClient;

    constructor() {
        this.gemini = new GeminiClient();
    }

    /** テキストを日本語に翻訳する。ローカル辞書でマッチすれば即時変換、なければ Gemini API にフォールバック */
    async translate(text: string): Promise<TranslationPair> {
        const trimmed = text.trim();
        if (!trimmed) {
            return { original: text, translated: text };
        }

        // ローカル辞書で部分マッチを試みる（複数エントリを順次置換）
        let translated = trimmed;
        let matched = false;
        for (const entry of DICT) {
            if (entry.regex) {
                const re = new RegExp(entry.pattern, 'g');
                if (re.test(translated)) {
                    translated = translated.replace(new RegExp(entry.pattern, 'g'), entry.translation);
                    matched = true;
                }
            } else if (translated.includes(entry.pattern)) {
                translated = translated.split(entry.pattern).join(entry.translation);
                matched = true;
            }
        }
        // 辞書でマッチしても未翻訳の英語長文が残る場合は Gemini にフォールバック
        if (matched && !hasSignificantEnglish(translated)) {
            return { original: text, translated };
        }

        // ローカル辞書で対応できない場合は Gemini API にフォールバック
        const prompt = [
            '以下の英語テキストを自然な日本語に翻訳してください。',
            '意味優先で、逐語訳に偏りすぎないようにしてください。',
            '翻訳文のみを返してください。',
            '',
            trimmed
        ].join('\n');

        try {
            const result = await this.gemini.chat(prompt);
            return { original: text, translated: result.trim() };
        } catch {
            // Gemini 失敗時は原文を返す（翻訳不能でも動作を止めない）
            return { original: text, translated: text };
        }
    }

    /** 複数行テキストをまとめて翻訳する（Gemini API 呼び出し回数を削減） */
    async translateBatch(text: string): Promise<TranslationPair> {
        const trimmed = text.trim();
        if (!trimmed) {
            return { original: text, translated: text };
        }

        // まずローカル辞書で全行を一括置換
        let translated = trimmed;
        let matched = false;
        for (const entry of DICT) {
            if (entry.regex) {
                const re = new RegExp(entry.pattern, 'gm');
                if (re.test(translated)) {
                    translated = translated.replace(new RegExp(entry.pattern, 'gm'), entry.translation);
                    matched = true;
                }
            } else if (translated.includes(entry.pattern)) {
                translated = translated.split(entry.pattern).join(entry.translation);
                matched = true;
            }
        }

        // 辞書で置換済みかつ未翻訳の英語長文が残っていなければそのまま返す
        if (matched && translated !== trimmed && !hasSignificantEnglish(translated)) {
            return { original: text, translated };
        }

        // Gemini API でバッチ翻訳
        const prompt = [
            '以下のターミナル出力テキストを自然な日本語に翻訳してください。',
            '意味優先で、逐語訳に偏りすぎないようにしてください。',
            'コマンド名・ファイルパス・数値はそのまま残してください。',
            '翻訳文のみを返してください。',
            '',
            trimmed
        ].join('\n');

        try {
            const result = await this.gemini.chat(prompt);
            return { original: text, translated: result.trim() };
        } catch {
            return { original: text, translated: text };
        }
    }
}
