#!/bin/bash
set -euo pipefail

# --- Environment Variables ---
# BRANCH                   : Branch name to create (required)
# BASE_BRANCH              : Base branch to checkout from (default: main)
# PROMPT                   : Claude Code prompt to execute (required)
# COMMIT_MESSAGE           : Commit message (optional)
# CLAUDE_MODEL             : Model to use (optional)
# CLAUDE_CODE_OAUTH_TOKEN  : OAuth token for authentication (required)
# GIT_USER_NAME            : Git user name (default: magi-sandbox)
# GIT_USER_EMAIL           : Git user email (default: magi-sandbox@localhost)
# ENABLE_FIREWALL          : Enable network firewall (default: true)
# CREATE_PR                : Create a GitHub PR after push (default: false)
# PR_TITLE                 : Pull request title (optional, defaults to branch name)
# PR_BODY                  : Pull request body (optional)
# GH_TOKEN                 : GitHub token required for PR creation
#
# Mount:
#   -v /path/to/repo:/repo:ro  — ローカルリポジトリを read-only マウント

# --- Logging ---
log() {
  echo "[magi-sandbox] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_error() {
  echo "[magi-sandbox] $(date '+%Y-%m-%d %H:%M:%S') ERROR: $*" >&2
}

BRANCH="${BRANCH:?BRANCH is required}"
BASE_BRANCH="${BASE_BRANCH:-main}"
PROMPT="${PROMPT:?PROMPT is required}"
GIT_USER_NAME="${GIT_USER_NAME:-magi-sandbox}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-magi-sandbox@localhost}"
ENABLE_FIREWALL="${ENABLE_FIREWALL:-true}"
CREATE_PR="${CREATE_PR:-false}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"

# --- Validate ---
if [ ! -d "/repo/.git" ]; then
  log_error "/repo is not a git repository. Mount with: -v /path/to/repo:/repo:ro"
  exit 1
fi

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  log_error "CLAUDE_CODE_OAUTH_TOKEN is required. Generate with: claude setup-token"
  exit 1
fi

# --- Firewall ---
if [ "$ENABLE_FIREWALL" = "true" ]; then
  log "Setting up firewall..."
  if ! sudo /usr/local/bin/init-firewall.sh; then
    log "WARNING: Firewall setup failed. Continuing without firewall protection."
  fi
fi

# --- Git Config ---
git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"

# --- Git Authentication ---
if [ -n "${GH_TOKEN:-}" ]; then
  log "Configuring Git authentication with GH_TOKEN..."
  git config --global "url.https://x-access-token:${GH_TOKEN}@github.com/.insteadOf" "https://github.com/"
  git config --global "url.https://x-access-token:${GH_TOKEN}@github.com/.pushInsteadOf" "git@github.com:"
fi

# --- Copy repo & setup branch ---
log "Copying repository..."
cp -a /repo /workspace/repo
cd /workspace/repo

# remote URL を取得 (push 用)
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")

log "Creating branch: $BRANCH (from $BASE_BRANCH)"
git checkout "$BASE_BRANCH"
git checkout -b "$BRANCH"

# --- Install Dependencies ---
if [ -f "bun.lock" ] || [ -f "bunfig.toml" ]; then
  log "Installing dependencies with bun..."
  bun install
elif [ -f "package-lock.json" ]; then
  log "Installing dependencies with npm..."
  npm ci
elif [ -f "package.json" ]; then
  log "Installing dependencies with npm..."
  npm install
fi

# --- Run Claude Code ---
log "Running Claude Code..."
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
  log "Committing changes..."
  git add -A
  git commit -m "${COMMIT_MESSAGE:-chore: automated changes by magi-sandbox}"

  if [ -n "$REMOTE_URL" ]; then
    log "Pushing branch $BRANCH..."
    git push origin "$BRANCH"
    log "Done. Branch $BRANCH pushed successfully."

    if [ "$CREATE_PR" = "true" ]; then
      if [ -z "${GH_TOKEN:-}" ]; then
        log_error "GH_TOKEN is not set. Skipping PR creation."
      else
        log "Creating pull request..."
        if PR_URL=$(gh pr create \
          --title "${PR_TITLE:-$BRANCH}" \
          --body "${PR_BODY:-}" \
          --head "$BRANCH" \
          --base "$BASE_BRANCH" 2>&1); then
          log "Pull request created: $PR_URL"
        else
          log_error "Failed to create pull request: $PR_URL"
        fi
      fi
    fi
  else
    log "No remote configured. Changes committed locally."
  fi
else
  log "No changes detected. Nothing to commit."
  exit 1
fi
