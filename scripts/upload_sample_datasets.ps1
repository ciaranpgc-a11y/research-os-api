param(
  [Parameter(Mandatory=$true)][string]$ApiBaseUrl,
  [Parameter(Mandatory=$true)][string]$SessionToken,
  [string]$ProjectId = '',
  [string]$DatasetDir = 'tmp/sample-datasets'
)

$ErrorActionPreference = 'Stop'

$base = $ApiBaseUrl.TrimEnd('/')
if ($base.EndsWith('/v1')) { $base = $base.Substring(0, $base.Length - 3) }
$uploadUrl = "$base/v1/library/assets/upload"

if (-not (Test-Path $DatasetDir)) {
  throw "Dataset directory not found: $DatasetDir"
}

$files = Get-ChildItem -Path $DatasetDir -File | Where-Object { $_.Extension -in '.csv', '.xlsx' }
if ($files.Count -eq 0) {
  throw "No .csv or .xlsx files found in $DatasetDir"
}

$headers = @{ Authorization = "Bearer $SessionToken" }

Write-Host "Uploading $($files.Count) dataset(s) to $uploadUrl ..."
$curlArgs = @(
  '-sS',
  '-X', 'POST',
  '-H', "Authorization: Bearer $SessionToken"
)

foreach ($file in $files) {
  $curlArgs += @('-F', "files=@$($file.FullName)")
}
if ($ProjectId.Trim()) {
  $curlArgs += @('-F', "project_id=$($ProjectId.Trim())")
}
$curlArgs += $uploadUrl

$response = & curl.exe @curlArgs
if ($LASTEXITCODE -ne 0) {
  throw "Upload request failed with exit code $LASTEXITCODE."
}
Write-Host 'Upload request sent.'
$response
