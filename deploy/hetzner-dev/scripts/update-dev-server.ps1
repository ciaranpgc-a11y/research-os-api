$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"

$RemoteScript = @'
set -euo pipefail

cd /srv/dev/research-os-api/app
# Preserve any uncommitted server-side edits as a recoverable stash instead of
# letting `git reset --hard` silently discard them. Only stash when the tree is
# actually dirty, and let `set -e` abort the deploy if the stash fails — never
# fall through to `reset --hard` on a dirty tree. Recover later with `git stash list`.
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "pre-deploy autostash $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
git fetch origin main
git reset --hard origin/main

cd /srv/dev/research-os-api
docker compose up -d --build

docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
echo '---'
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/v1/health/ready; then
    exit 0
  fi
  sleep 2
done

docker logs --tail 80 dev-research-os-api
exit 1
'@

# Normalize line endings to LF. A CRLF here-string reaches remote bash as e.g.
# `pipefail\r`, making `set -o pipefail` fail with "invalid option name".
$RemoteScript = $RemoteScript.Replace("`r`n", "`n")

ssh -i $KeyPath "${ServerUser}@${ServerHost}" $RemoteScript
