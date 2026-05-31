$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"

$RemoteScript = @'
set -euo pipefail

cd /srv/dev/research-os-api/app
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

ssh -i $KeyPath "${ServerUser}@${ServerHost}" $RemoteScript
