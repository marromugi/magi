---
name: implement
description: "Issue DB の issue を Docker sandbox で TDD 実装し、PR を作成するスキル。"
---

# Implement Skill

Issue DB に登録された issue を Docker コンテナ (magi-sandbox) 内で TDD 実装し、PR を作成します。
コンテナ内では `--dangerously-skip-permissions` で完全自律実行されます。

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

### 3. リポジトリ情報の取得

```bash
# プロジェクトルートの絶対パス
REPO_PATH=$(git rev-parse --show-toplevel)

# 現在のブランチ (ベースブランチ)
BASE_BRANCH=$(git branch --show-current)
```

### 4. sandbox イメージの確認

```bash
# イメージの存在確認。なければビルド
docker image inspect magi-sandbox:latest 2>/dev/null || \
  docker build -t magi-sandbox:latest -f packages/sandbox/Dockerfile packages/sandbox/
```

### 5. 実装プロンプトの組み立て

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

### 6. コンテナの起動

```bash
docker run --rm \
  --name "magi-sandbox-issue-<ID>" \
  -v "$REPO_PATH:/repo:ro" \
  -v "$HOME/.claude:/root/.claude:ro" \
  -e "BRANCH=<branch>" \
  -e "BASE_BRANCH=$BASE_BRANCH" \
  -e "PROMPT=<上記テンプレートを展開したもの>" \
  -e "COMMIT_MESSAGE=<commit_message>" \
  magi-sandbox:latest
```

コンテナ内部のフロー:

1. `/repo` (read-only) を `/workspace/repo` にコピー
2. `BASE_BRANCH` から `BRANCH` を作成
3. 依存パッケージをインストール
4. `claude --dangerously-skip-permissions --print` でプロンプトを実行
5. 変更があれば commit & push (remote が設定されている場合)

### 7. 結果の処理

コンテナの終了コードで成功/失敗を判定する。

#### 成功時 (exit 0)

1. ブランチを issue に記録しステータスを `done` に更新
2. PR を作成

```bash
bun run magi issue update <ID> --status done --branch "<branch>"
```

```bash
gh pr create \
  --head "<branch>" \
  --title "{commit_message}" \
  --body "$(cat <<'EOF'
## Summary
- {title}

## 受け入れ条件
{acceptance}

## Issue
Closes issue #<ID> (local)

## Test plan
- [ ] テストが Green であること
- [ ] CLAUDE.md の規約に準拠していること

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### 失敗時 (exit 非0)

1. ステータスを `blocked` に更新
2. コンテナの出力をユーザーに報告

```bash
bun run magi issue update <ID> --status blocked
```

### 8. 複数 Issue の並列実装

複数の独立した issue を同時に実装する場合、複数の `docker run` を並列で実行する。
各コンテナは独立しているため安全に並列化できる。

```bash
# 実装可能な issue を全て取得
bun run magi issue ready

# 各 issue を並列でコンテナ起動
docker run --rm --name magi-sandbox-issue-1 ... &
docker run --rm --name magi-sandbox-issue-2 ... &
docker run --rm --name magi-sandbox-issue-3 ... &
wait
```

## ユーザーへの出力

実装完了後:

```
## 実装結果

| ID | タイトル | ステータス | ブランチ | PR |
|----|---------|----------|---------|-----|
| #1 | 型定義追加 | done | feat/001-types | #42 |
| #2 | API実装  | done | feat/002-api  | #43 |
```
