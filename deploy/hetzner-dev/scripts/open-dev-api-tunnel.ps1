$ServerHost = "178.104.54.229"
$ServerUser = "ciaran"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid"
$LocalPort = 18000
$RemotePort = 8000

ssh -i $KeyPath -L "${LocalPort}:127.0.0.1:${RemotePort}" "${ServerUser}@${ServerHost}" -N
