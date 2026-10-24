#!/usr/bin/env bash
# Turns every ticket in .github/agent-backlog/ into a GitHub issue.
#
# Requires the GitHub CLI (https://cli.github.com) and `gh auth login`.
# Run from the repo root:   ./scripts/create-issues.sh
# Preview without creating:  ./scripts/create-issues.sh --dry-run
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found. Install it from https://cli.github.com and run 'gh auth login'." >&2
  exit 1
fi

# Make sure every label we use exists (gh fails on unknown labels).
declare -A LABEL_COLORS=(
  [agent-ready]=0e8a16 [easy]=c2e0c6 [medium]=fbca04 [hard]=d93f0b
  [feature]=1d76db [ui]=5319e7 [testing]=bfd4f2 [chore]=ededed
  [performance]=f9d0c4 [refactor]=d4c5f9 [scheduled]=006b75
)
if [[ "$DRY_RUN" == false ]]; then
  for label in "${!LABEL_COLORS[@]}"; do
    gh label create "$label" --color "${LABEL_COLORS[$label]}" --force >/dev/null
  done
fi

for file in .github/agent-backlog/*.md; do
  title=$(sed -n '1s/^# //p' "$file")
  labels=$(sed -n 's/^Labels: //p' "$file" | head -1 | tr -d ' ')
  body=$(sed '1d;/^Labels: /d' "$file")

  if gh issue list --state all --search "in:title \"$title\"" --json title --jq '.[].title' 2>/dev/null | grep -Fxq "$title"; then
    echo "skip (already exists): $title"
    continue
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "would create: $title  [$labels]"
  else
    gh issue create --title "$title" --label "$labels" --body "$body" >/dev/null
    echo "created: $title"
  fi
done
