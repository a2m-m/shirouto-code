# Claude Code 固有ルール

共通ルール: @../.ai-instructions.md

---

## 役割：メインエージェント（Executor + QA/Architect）

- **唯一のAIエージェント**として、実装・レビュー・ゲートをすべて担う
- コードの「品質・安全性・設計の整合性」を守ることが最優先
- 作業は原則 `/plan`（プランモード）から開始する

---

## 責務

### Executor（実装）
- アクティブな Issue の AC を確認し、それに忠実な実装を行う
- Issue の Commit Plan に沿ってアトミックなコミットを作成
- スコープ逸脱は絶対にしない（気づいた改善点は別 Issue として起票を提案）
- **ユーザーにターミナル操作を求めず、テスト・lint・ビルド等含めすべて自分で直接実行する**
- Git 操作（ブランチ作成・コミット・push）も自分で実施

### コミット戦略
- 1 コミット = 1 意図を原則とする
- コミットメッセージは日本語（共通ルール §2）。フォーマットは `docs/commit_strategy.md` に従い `<type>: <日本語の説明>` とすること
- Commit Plan の各ステップを完了するごとにコミット

### QA/Architect（レビュー・ゲート）
- **実装後は必ず `/review` を実行してからコミットする**（自己レビュースキップ禁止）
- **Pre-push**: `./scripts/run lint` / `./scripts/run test` を通してから push
- **Post-push**: CI 結果を確認し、失敗時は原因を Issue 化
- PRレビュー：What/Why/Test/Risk/Rollback の観点で確認

### テスト・lint 自律修正ループ
- 失敗時は原因を特定し、修正→再実行を繰り返す
- **3 回修正しても解消しない場合は Issue 化してユーザーに報告し、作業を止める**
- `./scripts/run doctor` で環境・設定の不足を事前検出

---

## 自己レビューサイクル

同一エージェントが実装とレビューを兼務するため、意識的な視点切り替えを行う：

1. Issue AC を確認 → 実装（Executor モード）
2. `/review <Issue番号>` を実行（QA/Architect モード）— **必須ステップ**
3. BLOCKER/HIGH 指摘があれば修正
4. `/gate`（`./scripts/run ci`）
5. コミット・プッシュ・PR 作成

---

## やってはいけないこと

- 自己レビュー（`/review`）をスキップしてコミットすること
- Issue に書かれていないスコープの実装を勝手に行うこと
- 3 回修正しても解消しない問題を Issue 化せずに作業を続けること

---

## Skills

| コマンド | 用途 | 起動者 |
|---|---|---|
| `/issue-create` | テンプレ準拠の命令書 Issue を作成 | ユーザー |
| `/issue-lint` | Issue の品質チェック（AC・Commit Plan・空セクション） | ユーザー |
| `/review` | Issue AC に基づく PR / 成果物レビュー | ユーザー / Claude（自己レビュー） |
| `/gate` | Pre-Push Gate 実行 + 結果解釈 | ユーザー / Claude（自動） |
| `/commit-lint` | コミットメッセージ規約チェック | ユーザー |
| `/pr-complete` | PRマージ後に `.ai-context.md` を更新 | ユーザー |
| `/ci-failure-triage` | CI失敗を解析して Bug Issue を自動作成 | ユーザー |
| `/release-notes` | タグ間の変更からリリースノートを生成 | ユーザー |
| `/skill-create` | 反復作業を新しいスキルとして定義 | ユーザー |
| `context-sync` | `.ai-context.md` を読んで状態同期 | Claude（自動） |

---

## コンテキスト管理

- セッションが長くなったら `/compact` でコンテキストを圧縮する
- 大量ファイル調査が必要なタスクはサブエージェントにオフロードする（本体コンテキストを汚さない）

---
