#!/bin/bash
set -euo pipefail

# commit-push.sh — Format, commit, and push changes from within a sandbox container.
# Designed to be executed via `docker exec`.

# --- Logging ---
log() {
  echo "[magi-sandbox] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_error() {
  echo "[magi-sandbox] $(date '+%Y-%m-%d %H:%M:%S') ERROR: $*" >&2
}

cd /workspace/repo

BRANCH="${BRANCH:-$(git branch --show-current)}"
BASE_BRANCH="${BASE_BRANCH:-main}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: automated changes by magi-sandbox}"
CREATE_PR="${CREATE_PR:-false}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")

# --- Format ---
if [ -n "$(git status --porcelain)" ]; then
  if [ -f "bun.lock" ] || [ -f "bunfig.toml" ]; then
    log "Running bun format..."
    bun run format || log "WARNING: bun format failed. Continuing."
  fi
fi

# --- Commit & Push ---
if [ -n "$(git status --porcelain)" ]; then
  log "Committing changes..."
  git add -A
  git commit -m "$COMMIT_MESSAGE"

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
