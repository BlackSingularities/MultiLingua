#!/usr/bin/env bash
set -euo pipefail
# Klucz GitHub Actions jest ograniczony w authorized_keys wyłącznie do tej komendy:
#   restrict,command="/opt/apps/multilingua/ssh-command.sh" ssh-ed25519 AAAA... multilingua-deploy
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  echo 'Only deploy <commit-sha> is allowed.' >&2
  exit 1
fi
sha=${BASH_REMATCH[1]}
mkdir -p /opt/apps/multilingua/incoming
archive=$(mktemp /opt/apps/multilingua/incoming/release.XXXXXX.tar.gz)
trap 'rm -f -- "$archive"' EXIT
head -c 104857601 > "$archive"
[[ $(stat -c %s "$archive") -le 104857600 ]] || exit 1
bash /opt/apps/multilingua/deploy.sh "$sha" "$archive"
