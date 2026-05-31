$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"

ssh -i $KeyPath "${ServerUser}@${ServerHost}" `
  "cd /srv/dev/research-os-api && docker compose up -d --build && docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep dev-research-os-api"
