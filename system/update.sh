#!/bin/bash
# PiVista updater. Downloads the code branch through the GitHub API (works for public AND
# private repositories) and runs its installer. Used by Settings → Update PiVista and `pivista update`.
#
# Private repo: save a GitHub token (fine-grained, "Contents: Read-only" on the repo) in
#   Settings → System → GitHub access token      (stored in /var/lib/pivista/github-token, mode 600)
# or:  echo 'github_pat_…' | sudo tee /var/lib/pivista/github-token && sudo chmod 600 /var/lib/pivista/github-token
#
# Optional overrides in /etc/default/pivista:  PIVISTA_REPO=owner/name  PIVISTA_BRANCH=branch
set -euo pipefail
[ -f /etc/default/pivista ] && . /etc/default/pivista
REPO="${PIVISTA_REPO:-pyrz-tr/PiVista}"
BRANCH="${PIVISTA_BRANCH:-claude/kind-mccarthy-xql5k2}"
DATA="${PIVISTA_DATA:-/var/lib/pivista}"
LOG="$DATA/update.log"
TOKEN="${GITHUB_TOKEN:-}"
[ -z "$TOKEN" ] && [ -r "$DATA/github-token" ] && TOKEN="$(tr -d ' \n\r' < "$DATA/github-token")"

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo pivista update"; exit 1; }
mkdir -p "$DATA"
exec > >(tee "$LOG") 2>&1
echo "PiVista update  $(date)  repo=$REPO branch=$BRANCH  token=$([ -n "$TOKEN" ] && echo yes || echo no)"
echo "running" > "$DATA/update.status"
trap 'echo "failed" > "$DATA/update.status"' ERR

api() { curl -fsSL --retry 3 -H "Accept: application/vnd.github+json" ${TOKEN:+-H "Authorization: Bearer $TOKEN"} "$@"; }

fail() { echo "ERROR: $*"; echo "failed" > "$DATA/update.status"; exit 1; }
RESP="$(api "https://api.github.com/repos/$REPO/commits/$BRANCH")" || fail "cannot reach $REPO@$BRANCH. Private repo? Add a GitHub token in Settings → System."
SHA="$(printf '%s\n' "$RESP" | sed -nE 's/^  "sha": *"([0-9a-f]{40})".*/\1/p' | head -n1)"
[ -n "$SHA" ] || fail "unexpected answer from GitHub" 
echo "latest commit: $SHA"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
api "https://api.github.com/repos/$REPO/tarball/$BRANCH" -o "$TMP/src.tgz"
mkdir "$TMP/src" && tar xzf "$TMP/src.tgz" -C "$TMP/src" --strip-components=1
[ -f "$TMP/src/scripts/install.sh" ] || fail "download does not look like PiVista"
echo "version: $(grep -m1 '"version"' "$TMP/src/package.json" | sed -E 's/.*: *"([^"]+)".*/\1/')"

# record the commit first: the installer restarts the PiVista server at the end
echo "$SHA" > "$DATA/installed-commit"
echo "installing" > "$DATA/update.status"
if [ "${PIVISTA_UPDATE_DRYRUN:-0}" = 1 ]; then echo "dry run: would run the installer now"; exit 0; fi
bash "$TMP/src/scripts/install.sh" --keep-hostname
echo "PiVista updated to $SHA"
