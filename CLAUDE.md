# MAGI

Claude Code を自律的にオーケストレーションするコーディングエージェント。

## Tech Stack

- Runtime / Package Manager: Bun (workspaces)
- Language: TypeScript
- Build: tsup
- Lint: ESLint + Prettier

## Monorepo Structure

```
packages/
  core/   — ドメインロジック・DB 管理 (@magi/core)
  cli/    — CLI エントリポイント (@magi/cli) — core を使う
```

## Commands (root)

- `bun run dev` — CLI を watch モードで起動
- `bun run build` — 全パッケージをビルド
- `bun run lint` — ESLint
- `bun run format` — Prettier (--write)
- `bun run format:check` — Prettier (check only)
- `bun test` — 全パッケージのテスト

## Development Rules

### TDD (Red → Green → Refactor)

1. **Red**: 先にテストを書き、失敗することを確認する
2. **Green**: テストを通す最小限のコードを書く
3. **Refactor**: テストが通る状態を維持しつつリファクタリングする

- テストは必ず書く。テストなしのプロダクションコードは許可しない
- テストファイルは対象ファイルと同階層に `*.test.ts` として配置する

### バグ・改善点の発見時

- 実装中にバグや改善点を見つけたら、積極的に `/issue` コマンドで issue を作成する
- 今の作業スコープ外の問題でも、見つけた時点で issue として記録しておく
- issue 化することで対応漏れを防ぎ、優先度を判断できるようにする

### 責務の分離

- 1 つの関数 / モジュールが担う目的は最小限にする
- 責務が混在している場合は分割を優先する
- 分割によりアーキテクチャ変更が必要なら、実装前に計画を立てる
