// VS Code API の最小モック（テスト環境用）
export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T): T => defaultValue as T
    })
};
