$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$FrontendDir = Join-Path $RepoRoot "frontend"
$ApiBaseUrl = "https://api.axiomos.studio"

Set-Location $FrontendDir
$env:VITE_API_BASE_URL = $ApiBaseUrl

npm.cmd run dev
