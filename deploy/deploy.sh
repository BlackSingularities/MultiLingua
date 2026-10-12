#!/usr/bin/env bash
# Wdrożenie MultiLingua na serwerze: build obrazu, podmiana kontenera, routing nginx,
# test przez publiczny adres i automatyczny powrót do poprzedniej wersji przy błędzie.
set -euo pipefail
umask 077
sha=${1:?commit required}
archive=${2:?archive required}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || exit 1
root=/opt/apps/multilingua
mkdir -p "$root/releases"
exec 9>"$root/deploy.lock"
flock -w 900 9

release="$root/releases/$sha"
mkdir -p "$release"
(umask 022; tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$release")
docker build --label app=multilingua --label "org.opencontainers.image.revision=$sha" -t "multilingua:$sha" "$release"

previous=$(cat "$root/current-sha" 2>/dev/null || true)
old_compose=$(mktemp "$root/compose.XXXXXX.yml")
if [[ -f "$root/compose.yml" ]]; then cp "$root/compose.yml" "$old_compose"; fi
trap 'rm -f -- "$old_compose"' EXIT

rollback() {
  if [[ -n "$previous" && -s "$old_compose" ]]; then
    cp "$old_compose" "$root/compose.yml"
    DEPLOY_SHA="$previous" docker compose -f "$root/compose.yml" up -d --wait --wait-timeout 120 || true
    echo "Wdrożenie nieudane; przywrócono obraz $previous" >&2
  fi
}

cp "$release/compose.yml" "$root/compose.yml"
export DEPLOY_SHA="$sha"
if ! docker compose -f "$root/compose.yml" up -d --wait --wait-timeout 120; then
  rollback; exit 1
fi

proxy=/opt/apps/proxy/conf.d/apps/multilingua.conf
proxy_backup=$(mktemp "$root/nginx.XXXXXX.conf")
had_proxy=false
if [[ -f "$proxy" ]]; then cp "$proxy" "$proxy_backup"; had_proxy=true; fi
cp "$release/deploy/nginx.conf" "$proxy"
chmod 644 "$proxy"
if ! docker exec proxy_nginx nginx -t; then
  if $had_proxy; then cp "$proxy_backup" "$proxy"; else rm -f -- "$proxy"; fi
  rm -f -- "$proxy_backup"
  rollback; exit 1
fi
docker exec proxy_nginx nginx -s reload
rm -f -- "$proxy_backup"

sleep 3
if ! curl --fail --silent --show-error --retry 5 --retry-delay 3 https://redzikowski.com/multilingua/api/health; then
  rollback; exit 1
fi

echo "$sha" > "$root/current-sha"
cp "$release/deploy/deploy.sh" "$root/deploy.sh"
cp "$release/deploy/ssh-command.sh" "$root/ssh-command.sh"
chmod 700 "$root/deploy.sh" "$root/ssh-command.sh"
# Zostaw 5 ostatnich wydań i obrazów.
ls -1dt "$root/releases"/*/ | tail -n +6 | xargs -r rm -rf
docker images multilingua --format '{{.Tag}}' | grep -v -e "^$sha$" -e "^${previous:-none}$" | xargs -r -I{} docker rmi "multilingua:{}" || true
echo "Wdrożono $sha"
