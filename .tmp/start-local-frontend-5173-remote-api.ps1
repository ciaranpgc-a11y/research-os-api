$ErrorActionPreference = 'Stop'

$repoRoot = 'c:\Users\Ciaran\Documents\GitHub\research-os-api\frontend'
$env:VITE_API_BASE_URL = 'https://api.axiomos.studio'

Set-Location $repoRoot
npm.cmd run dev
