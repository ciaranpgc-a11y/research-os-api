$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"

ssh -i $KeyPath "${ServerUser}@${ServerHost}" `
  "docker logs --tail 120 -f dev-research-os-api"
