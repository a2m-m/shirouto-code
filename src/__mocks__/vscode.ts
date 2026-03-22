// VS Code API の最小モック（テスト環境用）
export const workspace = {
    getConfiguration: jest.fn((_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T): T => defaultValue as T
    }))
};

export const window = {
    showErrorMessage: jest.fn()
};

export const Uri = {
    file: (path: string) => ({ fsPath: path, toString: () => path })
};
