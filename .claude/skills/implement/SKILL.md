---
name: implement
description: "Issue DB の issue を Docker sandbox で TDD 実装するスキル。"
---

# Implement Skill

Issue DB に登録された issue を Docker コンテナ (magi-sandbox) 内で TDD 実装します。
コンテナ内では `--dangerously-skip-permissions` で完全自律実行されます。
認証には `CLAUDE_CODE_OAUTH_TOKEN` を使用します（`claude setup-token` で生成）。

## CLI

すべての DB 操作は `bun run magi` を通して行う。ビルド済みの dist を実行する。

## Instructions

### 1. Issue の取得と検証

引数で issue ID を受け取る。ID が指定されない場合は、実装可能な issue 一覧を表示する。

```bash
# 指定 issue の詳細取得
bun run magi issue show <ID>

# 実装可能な issue 一覧 (依存が全て done)
bun run magi issue ready
```

検証:

- status が `queue` であること
- depends_on の issue が全て `done` であること
- 上記を満たさない場合はユーザーに理由を伝えて中断する

### 2. Issue のステータスを active に更新

```bash
bun run magi issue update <ID> --status active
```

### 3. 実装プロンプトの組み立て

以下のテンプレートでプロンプトを組み立てる:

```
## Issue
- Title: {title}
- Type: {type}
- Branch: {branch}
- Commit Message: {commit_message}

## 受け入れ条件
{acceptance}

## 背景
{context}

## 変更対象 (推定)
{affects}

## 実装フロー

必ず以下の TDD フローに従うこと:

### Step 1: テストを書く (Red)
- CLAUDE.md とプロジェクトの既存テストコードを必ず確認し、規約に従う
- 受け入れ条件をテストケースに落とす
- テストを実行して Red (失敗) になることを確認する

### Step 2: 実装 (Green)
- テストが通る最小限の実装を行う
- CLAUDE.md の規約に従う
- 実装後にテストを実行して Green (成功) になることを確認する

### Step 3: リファクタ (任意)
- 明らかな改善点があればリファクタする
- テストが Green のまま維持されることを確認する

### 重要な規約
- パッケージマネージャは bun を使うこと (npm/yarn/pnpm 禁止)
- テスト実行: bun test
```

### 4. sandbox の起動

`magi sandbox run` コマンドを使用してコンテナを起動する。
以下は `magi sandbox run` が自動処理するため、スキル側での対応は不要:

- `CLAUDE_CODE_OAUTH_TOKEN` の検証（未設定時はエラー終了）
- `GH_TOKEN` の解決（環境変数 or `gh auth token` から自動取得）
- sandbox イメージの存在確認

事前に `.env` から `CLAUDE_CODE_OAUTH_TOKEN` を読み込んでおく:

```bash
REPO_PATH=$(git rev-parse --show-toplevel)
BASE_BRANCH=$(git branch --show-current)

set -a && source "$REPO_PATH/.env" && set +a
```

ログディレクトリを作成し、コンテナ出力をファイルに保存する:

```bash
LOG_DIR="$REPO_PATH/.claude/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sandbox-issue-<ID>.log"
```

```bash
bun run magi sandbox run \
  --branch "<branch>" \
  --base-branch "$BASE_BRANCH" \
  --prompt "<上記テンプレートを展開したもの>" \
  --commit-message "<commit_message>" \
  --name "magi-sandbox-issue-<ID>" \
  --enable-firewall true \
  2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
```

コンテナ内部のフロー (magi sandbox run が自動実行):

1. ファイアウォールで外部通信を制限（npm / GitHub / Claude API のみ許可）
2. `/repo` (read-only) を `/workspace/repo` にコピー
3. `BASE_BRANCH` から `BRANCH` を作成
4. 依存パッケージをインストール
5. `claude --dangerously-skip-permissions --print` でプロンプトを実行
6. 変更があれば commit & push (remote が設定されている場合)

### 5. 結果の処理

`EXIT_CODE` (PIPESTATUS[0]) で成功/失敗を判定する。ログは `$LOG_FILE` に保存済み。

#### 成功時 (exit 0)

1. ブランチを issue に記録しステータスを `implemented` に更新

```bash
bun run magi issue update <ID> --status implemented --branch "<branch>"
```

#### 失敗時 (exit 非0)

1. ステータスを `blocked` に更新
2. コンテナの出力をユーザーに報告

```bash
bun run magi issue update <ID> --status blocked
```

### 6. 複数 Issue の並列実装

複数の独立した issue を同時に実装する場合、複数の `magi sandbox run` を並列で実行する。
各コンテナは独立しているため安全に並列化できる。

```bash
# 実装可能な issue を全て取得
bun run magi issue ready

REPO_PATH=$(git rev-parse --show-toplevel)
BASE_BRANCH=$(git branch --show-current)
set -a && source "$REPO_PATH/.env" && set +a

LOG_DIR="$REPO_PATH/.claude/logs"
mkdir -p "$LOG_DIR"

# 各 issue を並列で sandbox 起動 (ログをファイルに保存)
bun run magi sandbox run --branch <branch-1> --base-branch "$BASE_BRANCH" --prompt "<prompt-1>" --commit-message "<msg-1>" --name magi-sandbox-issue-1 --enable-firewall true 2>&1 | tee "$LOG_DIR/sandbox-issue-1.log" &
bun run magi sandbox run --branch <branch-2> --base-branch "$BASE_BRANCH" --prompt "<prompt-2>" --commit-message "<msg-2>" --name magi-sandbox-issue-2 --enable-firewall true 2>&1 | tee "$LOG_DIR/sandbox-issue-2.log" &
bun run magi sandbox run --branch <branch-3> --base-branch "$BASE_BRANCH" --prompt "<prompt-3>" --commit-message "<msg-3>" --name magi-sandbox-issue-3 --enable-firewall true 2>&1 | tee "$LOG_DIR/sandbox-issue-3.log" &
wait
```

## ユーザーへの出力

実装完了後:

```
## 実装結果

| ID | タイトル | ステータス | ブランチ |
|----|---------|----------|---------|
| #1 | 型定義追加 | implemented | feat/001-types |
| #2 | API実装  | implemented | feat/002-api  |
```
