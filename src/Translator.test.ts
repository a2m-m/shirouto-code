import { Translator } from './Translator';

// GeminiClient をモック：実際の API を呼ばずに動作を制御する
jest.mock('./GeminiClient', () => ({
    GeminiClient: jest.fn().mockImplementation(() => ({
        chat: jest.fn().mockResolvedValue('Gemini翻訳結果')
    }))
}));

// localDictionary に最小限のエントリを設定
jest.mock('./data/localDictionary.json', () => [
    { pattern: 'error', translation: 'エラー', regex: false },
    { pattern: 'done', translation: '完了', regex: false },
    { pattern: 'Permission denied', translation: '権限がありません', regex: false }
], { virtual: false });

import { GeminiClient } from './GeminiClient';

function getGeminiChatMock(): jest.Mock {
    const MockClass = GeminiClient as jest.MockedClass<typeof GeminiClient>;
    const results = MockClass.mock.results;
    const lastInstance = results[results.length - 1]?.value;
    return lastInstance?.chat as jest.Mock;
}

describe('Translator – フォールバック判定ロジック', () => {
    let translator: Translator;

    beforeEach(() => {
        jest.clearAllMocks();
        translator = new Translator();
    });

    describe('translate()', () => {
        test('辞書のみで完全置換できる定型文は Gemini を呼ばない', async () => {
            const result = await translator.translate('error');
            expect(result.translated).toBe('エラー');
            expect(getGeminiChatMock()).not.toHaveBeenCalled();
        });

        test('辞書にマッチしない純粋な英語テキストは Gemini にフォールバックする', async () => {
            const result = await translator.translate('This command failed unexpectedly');
            expect(result.translated).toBe('Gemini翻訳結果');
            expect(getGeminiChatMock()).toHaveBeenCalledTimes(1);
        });

        test('辞書でマッチ後も英語長文が残る混在テキストは Gemini にフォールバックする', async () => {
            // "error" は辞書でマッチするが、残りに英語長文が残る
            const result = await translator.translate('error: Unable to connect to the remote server');
            expect(result.translated).toBe('Gemini翻訳結果');
            expect(getGeminiChatMock()).toHaveBeenCalledTimes(1);
        });

        test('辞書で部分置換後に英語が残らなければ Gemini を呼ばない', async () => {
            // "done" → "完了" に置換され、残りが数値・記号のみ
            const result = await translator.translate('done (3 files)');
            expect(result.translated).toBe('完了 (3 files)');
            expect(getGeminiChatMock()).not.toHaveBeenCalled();
        });

        test('空文字列は Gemini を呼ばずそのまま返す', async () => {
            const result = await translator.translate('');
            expect(result.translated).toBe('');
            expect(getGeminiChatMock()).not.toHaveBeenCalled();
        });

        test('Gemini が失敗した場合は原文を返す', async () => {
            getGeminiChatMock().mockRejectedValueOnce(new Error('API error'));
            const result = await translator.translate('This is an untranslatable long sentence');
            expect(result.translated).toBe('This is an untranslatable long sentence');
        });
    });

    describe('translateBatch()', () => {
        test('辞書のみで完全置換できる複数行テキストは Gemini を呼ばない', async () => {
            const result = await translator.translateBatch('error\ndone');
            expect(result.translated).toBe('エラー\n完了');
            expect(getGeminiChatMock()).not.toHaveBeenCalled();
        });

        test('辞書でマッチ後も英語長文が残る混在ログは Gemini にフォールバックする', async () => {
            const mixedLog = 'error\nFailed to load configuration from the specified path\ndone';
            const result = await translator.translateBatch(mixedLog);
            expect(result.translated).toBe('Gemini翻訳結果');
            expect(getGeminiChatMock()).toHaveBeenCalledTimes(1);
        });

        test('辞書でマッチしない純粋な英語複数行テキストは Gemini にフォールバックする', async () => {
            const result = await translator.translateBatch('Building project\nInstalling dependencies');
            expect(result.translated).toBe('Gemini翻訳結果');
            expect(getGeminiChatMock()).toHaveBeenCalledTimes(1);
        });

        test('空文字列は Gemini を呼ばずそのまま返す', async () => {
            const result = await translator.translateBatch('');
            expect(result.translated).toBe('');
            expect(getGeminiChatMock()).not.toHaveBeenCalled();
        });

        test('Gemini が失敗した場合は原文を返す', async () => {
            getGeminiChatMock().mockRejectedValueOnce(new Error('API error'));
            const result = await translator.translateBatch('Building the project from source files');
            expect(result.translated).toBe('Building the project from source files');
        });
    });
});
