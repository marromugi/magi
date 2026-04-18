#!/bin/bash
set -euo pipefail

# --- Environment Variables ---
# BRANCH          : Branch name to create (required)
# BASE_BRANCH     : Base branch to checkout from (default: main)
# PROMPT          : Claude Code prompt to execute (required)
# COMMIT_MESSAGE  : Commit message (optional)
# CLAUDE_MODEL    : Model to use (optional)
# GIT_USER_NAME   : Git user name (default: magi-sandbox)
# GIT_USER_EMAIL  : Git user email (default: magi-sandbox@localhost)
#
# Mount:
#   -v /path/to/repo:/repo:ro   — ローカルリポジトリを read-only マウント
#   -v ~/.claude:/root/.claude:ro — Claude OAuth 認証情報

BRANCH="${BRANCH:?BRANCH is required}"
BASE_BRANCH="${BASE_BRANCH:-main}"
PROMPT="${PROMPT:?PROMPT is required}"
GIT_USER_NAME="${GIT_USER_NAME:-magi-sandbox}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-magi-sandbox@localhost}"

# --- Validate mount ---
if [ ! -d "/repo/.git" ]; then
  echo "[magi-sandbox] ERROR: /repo is not a git repository. Mount with: -v /path/to/repo:/repo:ro"
  exit 1
fi

# --- Git Config ---
git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"

# --- Copy repo & setup branch ---
echo "[magi-sandbox] Copying repository..."
cp -a /repo /workspace/repo
cd /workspace/repo

# remote URL を取得 (push 用)
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")

echo "[magi-sandbox] Creating branch: $BRANCH (from $BASE_BRANCH)"
git checkout "$BASE_BRANCH"
git checkout -b "$BRANCH"

# --- Install Dependencies ---
if [ -f "bun.lock" ] || [ -f "bunfig.toml" ]; then
  echo "[magi-sandbox] Installing dependencies with bun..."
  bun install
elif [ -f "package-lock.json" ]; then
  echo "[magi-sandbox] Installing dependencies with npm..."
  npm ci
elif [ -f "package.json" ]; then
  echo "[magi-sandbox] Installing dependencies with npm..."
  npm install
fi

# --- Run Claude Code ---
echo "[magi-sandbox] Running Claude Code..."
CLAUDE_ARGS=(
  --dangerously-skip-permissions
  --print
)

if [ -n "${CLAUDE_MODEL:-}" ]; then
  CLAUDE_ARGS+=(--model "$CLAUDE_MODEL")
fi

claude "${CLAUDE_ARGS[@]}" "$PROMPT"

# --- Commit & Push ---
if [ -n "$(git status --porcelain)" ]; then
  echo "[magi-sandbox] Committing changes..."
  git add -A
  git commit -m "${COMMIT_MESSAGE:-chore: automated changes by magi-sandbox}"

  if [ -n "$REMOTE_URL" ]; then
    echo "[magi-sandbox] Pushing branch $BRANCH..."
    git push origin "$BRANCH"
    echo "[magi-sandbox] Done. Branch $BRANCH pushed successfully."
  else
    echo "[magi-sandbox] No remote configured. Changes committed locally."
  fi
else
  echo "[magi-sandbox] No changes detected. Nothing to commit."
  exit 1
fi
