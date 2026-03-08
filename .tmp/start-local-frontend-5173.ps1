$ErrorActionPreference = 'Stop'

$repoRoot = 'c:\Users\Ciaran\Documents\GitHub\research-os-api\frontend'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8001'

Set-Location $repoRoot
npm.cmd run dev
