$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"

ssh -i $KeyPath "${ServerUser}@${ServerHost}" `
  "docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'; echo '---'; curl -fsS http://127.0.0.1:8000/v1/health/ready"
