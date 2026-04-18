---
name: issue
description: "機能要望やリファクタリングをコミット粒度の issue に分解して magi CLI 経由で DB に登録するスキル。重複・依存チェック付き。"
---

# Issue Management Skill

ユーザーの機能要望やリファクタリング要求を、コミット粒度の issue に分解して DB に登録します。

## CLI

すべての DB 操作は `bun run magi` を通して行う。ビルド済みの dist を実行する。直接 sqlite3 を叩かない。

## Instructions

### 1. 既存 issue の確認

まず DB から既存の issue (queue, active, blocked) を取得して、重複や関連がないか確認する。

```bash
bun run magi issue list --status queue,active,blocked
```

確認ポイント:

- 同じ目的の issue が既にないか
- 関連する issue があれば depends_on に追加するか、既存 issue に統合するか判断する

### 2. コミット粒度への分解

ユーザーの要望を **1コミット = 1 issue** の粒度に分解する。

分解の基準:

- 1つの issue は 1つの明確な変更単位
- テストと実装はセットで1つの issue
- 型定義の追加など、他の issue が依存する共通部分は先に切り出す

### 3. 受け入れ条件の定義

各 issue には **ユースケースベースの受け入れ条件** を書く。
テストの実装詳細 (モック方法、ライブラリ等) は書かない。それは CLAUDE.md とプロジェクトの既存コードに従う。

良い例:

```
- 存在するユーザーIDで取得できる
- 存在しないIDで適切なエラーが返る
```

悪い例:

```
- vi.mock で UserRepository をモックして...
- supertest で GET /users/:id を叩いて...
```

### 4. Issue の登録

```bash
bun run magi issue create \
  --title "タイトル" \
  --type feat \
  --priority normal \
  --depends-on '[1, 2]' \
  --affects '["src/auth/**", "src/middleware/auth.ts"]' \
  --acceptance "受け入れ条件 (改行区切り)" \
  --context "背景・補足" \
  --branch "feat/XXX-short-name" \
  --commit-message "feat(scope): description"
```

フィールド説明:

- `--title`: issue のタイトル
- `--type`: feat, fix, refactor, chore, test, docs
- `--priority`: normal (通常) or interrupt (割り込み・全体リファクタ等)
- `--depends-on`: 依存する issue の ID リスト (JSON array)
- `--affects`: 影響範囲の glob パターン (JSON array)。厳密な変更対象ではなく、この issue が関わる領域を示す。通常 issue では空 `[]` でもよい。割り込み issue では他セッションのブロック範囲として使われる。
- `--acceptance`: ユースケースベースの受け入れ条件
- `--context`: 背景情報
- `--branch`: ブランチ名
- `--commit-message`: Conventional Commits 形式のコミットメッセージ

### 5. 割り込み (interrupt) の登録

全体的なリファクタリングなど、他の作業を止める必要がある場合:

- `--priority interrupt` にすると、他の worktree セッションの Edit/Write hook がこれを検知してブロックする
- `--affects '[]'` (空配列) の場合は全ファイルがブロック対象になる
- 割り込み実装完了後は `status='done'` に更新して、他セッションのブロックを解除する

### 6. ステータス管理

```bash
# 実装開始時
bun run magi issue update 1 --status active

# 完了時
bun run magi issue update 1 --status done

# 依存先が未完了でブロック
bun run magi issue update 1 --status blocked
```

### 7. 実装可能な issue の取得

依存先が全て done になっている queue の issue を取得:

```bash
bun run magi issue ready
```

### 8. 一覧表示

```bash
bun run magi issue list
```

## ユーザーへの出力

Issue 登録後は以下の形式で結果を表示する:

```
## 登録した Issue

| ID | タイトル | Type | 依存 |
|----|---------|------|------|
| #1 | 型定義追加 | feat | - |
| #2 | API実装  | feat | #1 |

## 依存グラフ
#1 → #2
```
