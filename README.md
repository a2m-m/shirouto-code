# シロートコード

VS Code 互換 IDE の統合ターミナルに並走する日本語 sidecar 拡張。
英語の CLI 出力を翻訳・解説し、初心者がターミナル操作を安心して進められるよう支援します。

## 主な機能

| 機能 | 説明 |
|---|---|
| **翻訳** | 英語のターミナル出力を日本語で表示（原文は常に保持） |
| **コマンド解説** | 実行コマンドの意味・オプション・危険度を解説カードで表示 |
| **エラー要約** | 長いログやスタックトレースを短く要約 |
| **質問応答** | 「このエラーどういう意味？」などを自然文で質問できる |
| **危険コマンド警告** | `rm -rf` などの破壊的コマンドを事前に警告 |
| **秘密情報マスク** | API キーなどを AI 送信前に自動マスク |

## 必要環境

- VS Code ^1.85.0（または互換 IDE: Kiro, Antigravity 等）
- Node.js（拡張ビルド時）
- Gemini API キー（[Google AI Studio](https://aistudio.google.com/) から取得）

## セットアップ

### 1. VSIX をインストール

```bash
code --install-extension shirouto-code-0.0.1.vsix
```

または VS Code の拡張機能ビュー → `...` メニュー → 「VSIX からインストール」

### 2. Gemini API キーを設定

VS Code の設定（`Cmd+,`）で以下を検索して入力：

```
シロートコード: Gemini API キー
```

または `settings.json` に直接記述：

```json
{
  "shirouto-code.geminiApiKey": "YOUR_API_KEY"
}
```

### 3. Proposed API を有効化（必須）

本拡張はターミナル出力取得に VS Code の proposed API (`terminalDataWriteEvent`) を使用しています。
以下のオプションを付けて VS Code を起動する必要があります。

```bash
code --enable-proposed-api a2m-m.shirouto-code
```

> **注意**: この制約は VS Code 本家の安定版リリースでは解除できません。Kiro や Antigravity などのフォークでは設定方法が異なる場合があります。

## 使い方

### 翻訳セッションの開始（3 通りの起動方法）

**方法 1: コマンドパレット**

```
Cmd+Shift+P → "シロートコード: 翻訳セッションを開始"
```

**方法 2: ターミナルプロファイル**

新しいターミナルを開く際に「シロートコード翻訳セッション」を選択

**方法 3: PTY セッション（推奨）**

```
Cmd+Shift+P → "シロートコード: PTY 翻訳セッションを起動"
```

### sidecar パネルの表示

アクティビティバーの シロートコードアイコンをクリック、または：

```
Cmd+Shift+P → "シロートコード: パネルを開く"
```

### 質問する

sidecar パネル下部の入力欄に自然文で入力、または：

```
Cmd+Shift+Q（Mac）/ Ctrl+Shift+Q（Windows/Linux）
```

## 設定一覧

| 設定キー | 型 | デフォルト | 説明 |
|---|---|---|---|
| `shirouto-code.geminiApiKey` | string | `""` | Gemini API キー |
| `shirouto-code.enableAiSend` | boolean | `true` | AI へのターミナル出力送信を有効化 |
| `shirouto-code.customDangerCommands` | array | `[]` | ユーザー定義の危険コマンドルール |
| `shirouto-code.customSecretPatterns` | array | `[]` | ユーザー定義の秘密情報マスクパターン（正規表現） |
| `shirouto-code.history.enabled` | boolean | `true` | 質問応答履歴のローカル保存 |
| `shirouto-code.history.retentionDays` | number | `30` | 履歴保持期間（日数） |

### カスタム危険コマンドの例

```json
{
  "shirouto-code.customDangerCommands": [
    { "command": "kubectl", "level": "medium", "warning": "本番クラスタへの操作に注意" }
  ]
}
```

## 既知の制約

- **proposed API 依存**: `--enable-proposed-api` フラグなしでは翻訳セッションが起動しません
- **node-pty ビルド**: PTY セッションは C++ ネイティブモジュール（`node-pty`）を使用。Electron ABI との不一致が発生した場合は `npm run rebuild` を実行してください
- **全画面 TUI 非対応**: `vim` や `htop` などの全画面 TUI アプリの出力は翻訳対象外です
- **翻訳品質**: ローカル辞書でカバーされない出力は Gemini API にフォールバックします。API キー未設定時は英語のまま表示されます
- **シェル**: 現在は `zsh` を主な対象としています

## 開発者向け

```bash
# ビルド
npm run compile

# テスト
npm test

# node-pty を Electron ABI 向けにリビルド
npm run rebuild

# VSIX 生成
npm run package
```

リポジトリ: https://github.com/a2m-m/shirouto-code
