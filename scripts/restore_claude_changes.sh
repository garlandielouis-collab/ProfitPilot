#!/usr/bin/env bash
set -euo pipefail
BRANCH="claude/beautiful-varahamihira-207b79"
AUTO_STASH=0
DO_PUSH=0
usage(){
  echo "Usage: $0 [-b branch] [--auto-stash] [--push]"
  echo "  -b branch       : branch to merge (default: $BRANCH)"
  echo "  --auto-stash    : auto-stash uncommitted changes before running"
  echo "  --push          : push 'main' after merging"
  exit 1
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b) BRANCH="$2"; shift 2;;
    --auto-stash) AUTO_STASH=1; shift;;
    --push) DO_PUSH=1; shift;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

echo "Ensuring git is available..."
if ! command -v git >/dev/null 2>&1; then
  echo "git not found in PATH. Run these commands inside your VS Code terminal where git is available." >&2
  exit 2
fi

# 1) fetch
echo "Fetching refs..."
git fetch --all --prune

# 2) check uncommitted
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ $AUTO_STASH -eq 1 ]]; then
    echo "Stashing local changes..."
    git stash push -m "auto-stash-before-restore-$(date +%s)"
    STASHED=1
  else
    echo "You have uncommitted changes. Re-run with --auto-stash or commit/stash them first." >&2
    git status --porcelain
    exit 3
  fi
fi

# 3) ensure main up-to-date and backup
echo "Switching to 'main' and pulling latest..."
git switch main
git pull --rebase origin main || true
BACKUP_BRANCH="backup/main-before-claude-$(date +%s)"

echo "Creating backup branch: $BACKUP_BRANCH"
git switch -c "$BACKUP_BRANCH"

# 4) create integration branch
INTEGRATE_BRANCH="integrate/claude-$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/-/g')-$(date +%s)"

echo "Creating integration branch: $INTEGRATE_BRANCH"
git switch -c "$INTEGRATE_BRANCH"

echo "Merging $BRANCH into $INTEGRATE_BRANCH"
if ! git merge --no-ff "$BRANCH"; then
  echo "Merge reported conflicts. Resolve them, then run: git add <files>; git commit" >&2
  exit 4
fi

# 5) quick file list
echo "Files changed by merge:"
git --no-pager diff --name-only "$BACKUP_BRANCH".."$INTEGRATE_BRANCH"

# 6) run build/tests
if [[ -f package.json ]]; then
  echo "Installing dependencies (npm ci) and building..."
  npm ci
  if npm run build; then
    echo "Build succeeded."
  else
    echo "Build failed — inspect errors above." >&2
  fi
else
  echo "No package.json found — skipping npm build steps."
fi

# 7) merge into main (manual confirmation required)
read -p "Integration branch ready. Merge into 'main' now? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git switch main
  git merge --no-ff "$INTEGRATE_BRANCH"
  if [[ $DO_PUSH -eq 1 ]]; then
    git push origin main
  else
    echo "Merged locally; to push to origin: git push origin main"
  fi
else
  echo "Merge into 'main' skipped. You can test further on $INTEGRATE_BRANCH or merge later."
fi

# 8) restore stashed changes if any
if [[ "${STASHED-0}" -eq 1 ]]; then
  echo "You had auto-stashed changes. To reapply: git stash pop"
fi

echo "Done. Integration branch: $INTEGRATE_BRANCH   Backup branch: $BACKUP_BRANCH"
