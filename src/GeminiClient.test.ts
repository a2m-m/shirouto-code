import * as vscode from 'vscode';
import { GeminiClient, GeminiError, resetApiKeyErrorFlag } from './GeminiClient';

const mockShowErrorMessage = vscode.window.showErrorMessage as jest.Mock;

// API キーなしの設定を返すヘルパー
function mockNoApiKey(): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: (key: string, defaultValue?: unknown) => {
            if (key === 'geminiApiKey') { return ''; }
            return defaultValue;
        }
    });
}

// API キーありの設定を返すヘルパー
function mockWithApiKey(key: string): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: (k: string, defaultValue?: unknown) => {
            if (k === 'geminiApiKey') { return key; }
            return defaultValue;
        }
    });
}

describe('GeminiClient – API キー未設定の one-shot 通知', () => {
    let client: GeminiClient;

    beforeEach(() => {
        jest.clearAllMocks();
        resetApiKeyErrorFlag();
        client = new GeminiClient();
    });

    test('API キー未設定時、最初の呼び出しで showErrorMessage が 1 回呼ばれる', async () => {
        mockNoApiKey();
        await expect(client.chat('テスト')).rejects.toThrow(GeminiError);
        expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);
    });

    test('API キー未設定のまま 2 回呼んでも showErrorMessage は 1 回だけ', async () => {
        mockNoApiKey();
        await expect(client.chat('テスト')).rejects.toThrow(GeminiError);
        await expect(client.chat('テスト')).rejects.toThrow(GeminiError);
        expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);
    });

    test('resetApiKeyErrorFlag 後は再度 showErrorMessage が呼ばれる', async () => {
        mockNoApiKey();
        await expect(client.chat('テスト')).rejects.toThrow(GeminiError);
        expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);

        resetApiKeyErrorFlag();
        await expect(client.chat('テスト')).rejects.toThrow(GeminiError);
        expect(mockShowErrorMessage).toHaveBeenCalledTimes(2);
    });

    test('API キーが設定されているとき showErrorMessage は呼ばれない（fetch エラーは別途スロー）', async () => {
        mockWithApiKey('dummy-key');
        // fetch はモックしないので失敗するが、showErrorMessage は呼ばれない
        await expect(client.chat('テスト')).rejects.toThrow();
        expect(mockShowErrorMessage).not.toHaveBeenCalled();
    });
});
