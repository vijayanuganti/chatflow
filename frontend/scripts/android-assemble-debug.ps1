$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "android"

$candidates = @(
    (Join-Path ${env:ProgramFiles} "Android\Android Studio\jbr"),
    (Join-Path $env:LOCALAPPDATA "Programs\Android\Android Studio\jbr")
) | Where-Object { $_ -and (Test-Path (Join-Path $_ "bin\java.exe")) }

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    if ($candidates.Count -gt 0) {
        $env:JAVA_HOME = (Resolve-Path $candidates[0]).Path
        $env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$env:PATH"
        Write-Host "Using JAVA_HOME=$env:JAVA_HOME"
    }
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    Write-Error "JAVA_HOME is not set and Android Studio JBR was not found under Program Files or LocalAppData. Install Android Studio or set JAVA_HOME to its jbr folder."
}

Set-Location $android
& .\gradlew.bat assembleDebug @args
exit $LASTEXITCODE
