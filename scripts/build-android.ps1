# Build web bundle + sync Capacitor, then open Android Studio.
# Usage: .\scripts\build-android.ps1
# Optional: .\scripts\build-android.ps1 -AssembleDebug

param([switch]$AssembleDebug)

$ErrorActionPreference = "Stop"
$Frontend = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\frontend"
Push-Location $Frontend

Write-Host "==> npm run build:mobile (AWS API URLs from frontend/.env)" -ForegroundColor Cyan
# CRA treats eslint warnings as errors when CI=true (e.g. left over from test runs).
Remove-Item Env:CI -ErrorAction SilentlyContinue
npm run build:mobile
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }

if ($AssembleDebug) {
    Write-Host "==> Debug APK (Gradle)" -ForegroundColor Cyan
    npm run android:assemble
}

Write-Host "==> Opening Android Studio..." -ForegroundColor Cyan
npm run cap:android

Pop-Location
Write-Host @"

Android Studio opened.
  • Build signed release: Build > Generate Signed Bundle / APK
  • Ensure google-services.json is in frontend/android/app/
  • API base (release): https://vijay-chatflow.duckdns.org/api

"@ -ForegroundColor Green
