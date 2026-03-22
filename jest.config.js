/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    moduleNameMapper: {
        // vscode は Extension Host 外ではモック必須
        vscode: '<rootDir>/src/__mocks__/vscode.ts'
    }
};
