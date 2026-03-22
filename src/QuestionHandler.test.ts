import { QuestionHandler } from './QuestionHandler';
import { GeminiClient } from './GeminiClient';
import type { ParsedLine } from './TerminalOutputParser';

jest.mock('./GeminiClient');
const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>;

function makeLine(text: string): ParsedLine {
    return { text, kind: 'log' };
}

describe('QuestionHandler', () => {
    let handler: QuestionHandler;
    let mockChat: jest.Mock;

    beforeEach(() => {
        mockChat = jest.fn().mockResolvedValue('モック回答');
        MockedGeminiClient.prototype.chat = mockChat;
        handler = new QuestionHandler();
    });

    test('コンテキスト行が空の場合、contextSnippet は undefined', async () => {
        const { contextSnippet } = await handler.handle('質問', []);
        expect(contextSnippet).toBeUndefined();
    });

    test('コンテキスト行がある場合、contextSnippet が生成される', async () => {
        const lines = [makeLine('error: command not found')];
        const { contextSnippet } = await handler.handle('エラー原因は？', lines);
        expect(contextSnippet).toContain('error: command not found');
    });

    test('CONFIRM_PATTERNS にマッチする場合、Gemini を呼ばずにガイドを返す', async () => {
        const lines = [makeLine('Proceed with running this command?')];
        const { answer } = await handler.handle('どうすれば？', lines);
        expect(mockChat).not.toHaveBeenCalled();
        expect(answer).toContain('Claude Code');
    });

    test('50 行超のコンテキストは末尾 50 行に切り詰められる', async () => {
        const lines = Array.from({ length: 60 }, (_, i) => makeLine(`line ${i}`));
        await handler.handle('質問', lines);
        const prompt: string = mockChat.mock.calls[0][0];
        // 先頭 10 行は含まれないはず
        expect(prompt).not.toContain('line 0');
        expect(prompt).toContain('line 59');
    });
});
