$TunnelScript = Join-Path $PSScriptRoot "open-dev-api-tunnel.ps1"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$FrontendDir = Join-Path $RepoRoot "frontend"
$ApiBaseUrl = "http://127.0.0.1:18000"

Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$TunnelScript`""

Set-Location $FrontendDir
$env:VITE_API_BASE_URL = $ApiBaseUrl

npm.cmd run dev
