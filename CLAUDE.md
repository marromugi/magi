# MAGI

Sandbox 型の自律エージェントオーケストレーター。Docker コンテナ内で LLM エージェントがコマンド実行・ブラウザ操作を自律的に行う。

## Tech Stack

- Runtime / Package Manager: Bun (workspaces)
- Language: TypeScript
- Build: tsup
- Lint: ESLint + Prettier
- Test: bun:test (unit), Docker (integration)
- Container: Docker
- Browser: Chrome via CDP (Chrome DevTools Protocol)

## Monorepo Structure

```
packages/
  kv/          — KVProvider interface + FilesystemStorage (TTL 付き一時データ)
  db/          — DatabaseProvider interface + SQLite (devices, sessions, steps)
  storage/     — StorageProvider interface + FilesystemStorageProvider (バイナリ/ファイル)
  auth/        — DeviceStore + middleware (KV + DB, device pairing)
  sandbox/     — SandboxProvider interface + Docker provider (exec, snapshot/restore)
  browser/     — CDPClient + Browser API (navigate, click, type, content, screenshot)
  agent/       — LLM abstraction (Anthropic, OpenRouter) + agent loop + tools
  gateway/     — Hono HTTP server (auth, admin, sandbox proxy, sessions API)
  runtime/     — Runtime interface + local profile (provider 配線)
  cli/         — CLI (init, device, run, serve)
```

## Architecture

```
CLI (magi run / magi serve)
  └── Runtime (local profile)
        ├── KV: FilesystemStorage (bootstrap tokens, sessions)
        ├── DB: SQLite (devices, sessions, steps)
        ├── Storage: FilesystemStorageProvider (files)
        ├── Sandbox: DockerSandboxProvider (exec, snapshot)
        └── Browser: Chrome via CDP (separate container)

Agent Loop:
  User task → LLM → Tool call → Execute → Result → LLM → ... → Response

Tools:
  Layer 1 (sandbox 内): exec
  Layer 2 (sandbox 外): browser, upload, download, task
```

## Key Concepts

- **KV**: 短命な key-value データ (bootstrap token, pairing request). TTL 対応
- **DB**: 永続的な構造化データ (device, session, step). SQLite
- **Storage**: ファイル・バイナリデータ (ダウンロード物, アセット). ファイルシステム / R2
- **Sandbox**: Docker コンテナ内の隔離実行環境. stop/start で環境 (インストール済みパッケージ) を維持. /workspace はセッションごとにクリア
- **Browser**: CDP で Chrome を直接操作. WebDriver 不使用でボット検出回避. セッション (cookies) 維持
- **Runtime Profile**: 互換性のある provider セットを束ねる. local (Docker + SQLite + FS) / cloudflare (Containers + D1 + R2)

## CLI Commands

```bash
magi init                          # 設定 (API key, model)
magi run <task>                    # エージェントタスク実行
magi run <task> --browser          # ブラウザ付きで実行
magi run <task> --provider openrouter --model <model>
magi serve                         # Gateway サーバー起動
magi device invite                 # デバイスペアリング招待
magi device list                   # ペアリング済みデバイス一覧
magi device revoke <id>            # デバイス無効化
```

## Gateway API

```
Public:
  GET  /health
  POST /pair                       # bootstrap token でデバイスペアリング

Admin (Bearer admin API key):
  POST   /admin/devices/invite     # bootstrap token 生成
  GET    /admin/devices            # デバイス一覧
  DELETE /admin/devices/:id        # デバイス無効化

Device auth (Bearer device token):
  GET  /api/me                     # 接続確認
  POST /api/sandbox/exec           # sandbox でコマンド実行
  GET  /api/sandbox/status         # sandbox 状態
  POST /api/sandbox/snapshot       # スナップショット
  GET  /api/sessions               # セッション一覧
  GET  /api/sessions/:id           # セッション詳細
  GET  /api/sessions/:id/steps     # セッションのステップ一覧
```

## Commands (root)

- `bun run lint` — ESLint
- `bun run format` — Prettier (--write)
- `bun run format:check` — Prettier (check only)
- `bun test` — 全パッケージのテスト (Docker テストは別途)

## Development Rules

### TDD (Red -> Green -> Refactor)

1. **Red**: 先にテストを書き、失敗することを確認する
2. **Green**: テストを通す最小限のコードを書く
3. **Refactor**: テストが通る状態を維持しつつリファクタリングする

- テストは必ず書く。テストなしのプロダクションコードは許可しない
- テストファイルは対象ファイルと同階層に `*.test.ts` として配置する
- Docker を使うインテグレーションテストは `timeout` を長めに設定する

### バグ・改善点の発見時

- 実装中にバグや改善点を見つけたら、積極的に `/issue` コマンドで issue を作成する
- 今の作業スコープ外の問題でも、見つけた時点で issue として記録しておく
- issue 化することで対応漏れを防ぎ、優先度を判断できるようにする

### 責務の分離

- 1 つの関数 / モジュールが担う目的は最小限にする
- 責務が混在している場合は分割を優先する
- 分割によりアーキテクチャ変更が必要なら、実装前に計画を立てる
- sandbox 内操作は exec tool、sandbox 外操作は専用 tool (browser, upload 等)
