$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$port = 5177
$baseUrl = "http://127.0.0.1:$port"
$url = "$baseUrl/"
$logDir = Join-Path $root "logs"
$outLog = Join-Path $logDir "server.out.log"
$errLog = Join-Path $logDir "server.err.log"

Set-Location $root
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "JARO & DELTA Server wird vorbereitet..." -ForegroundColor Cyan

$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($ownerPid in $listeners) {
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid"
    if (-not $process) { continue }

    $isThisServer = $process.Name -ieq "node.exe" -and
      $process.CommandLine -match "server\.js" -and
      $process.CommandLine -like "*$root*"

    if ($isThisServer) {
      Write-Host "Alter JARO & DELTA Node-Server wird neu gestartet: PID $ownerPid" -ForegroundColor Yellow
    } else {
      Write-Host "Falscher Server auf Port $port wird beendet: $($process.Name) PID $ownerPid" -ForegroundColor Yellow
    }

    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host "Konnte PID $ownerPid nicht beenden: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}

Start-Sleep -Milliseconds 1000

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js wurde nicht gefunden. Bitte Node.js installieren oder PATH pruefen." -ForegroundColor Red
  pause
  exit 1
}

Write-Host "Starte richtigen Node-Server auf $url" -ForegroundColor Green
$serverProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/tracks" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
  }
}

if (-not $ready) {
  Write-Host "Server ist nicht rechtzeitig bereit geworden. Prozess PID: $($serverProcess.Id)" -ForegroundColor Red
  if (Test-Path $errLog) {
    $errorText = Get-Content -Path $errLog -Tail 20 -ErrorAction SilentlyContinue
    if ($errorText) {
      Write-Host "Letzte Server-Fehler:" -ForegroundColor Red
      $errorText | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    }
  }
  Write-Host "Logs:" -ForegroundColor Yellow
  Write-Host "  $outLog"
  Write-Host "  $errLog"
  pause
  exit 1
}

Write-Host "Server bereit. Oeffne Website..." -ForegroundColor Green
Start-Process $url
Write-Host "Wenn du fertig bist, kannst du dieses Fenster schliessen. Server PID: $($serverProcess.Id)" -ForegroundColor Cyan
