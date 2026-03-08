$ErrorActionPreference = 'Stop'

$repoRoot = 'c:\Users\Ciaran\Documents\GitHub\research-os-api'
$pythonExe = 'C:\Users\Ciaran\AppData\Local\Programs\Python\Python312\python.exe'

Set-Location $repoRoot
& $pythonExe -u -m uvicorn research_os.api.app:app --host 127.0.0.1 --port 8001 --lifespan off
