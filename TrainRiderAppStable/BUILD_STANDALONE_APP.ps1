$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Smart Railway - Standalone Android Build" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js and reopen PowerShell."
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing JavaScript dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}

Write-Host "Building release APK (Metro and USB are not required after installation)..." -ForegroundColor Yellow
Push-Location android
try {
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Android release build failed." }
}
finally {
    Pop-Location
}

$sourceApk = Join-Path $projectRoot "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $sourceApk)) {
    throw "Gradle finished but the release APK was not found at $sourceApk"
}

$releaseDir = Join-Path $projectRoot "release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$targetApk = Join-Path $releaseDir "SmartRailway-1.0.0.apk"
Copy-Item -Force $sourceApk $targetApk

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "APK: $targetApk" -ForegroundColor Green
Write-Host ""
Write-Host "Transfer this APK to an Android phone and open it to install." -ForegroundColor White
Write-Host "The installed release app does not need Metro, npm, Android Studio, or a USB connection." -ForegroundColor White
