param(
    [string]$Python = "py",
    [string]$PythonVersion = "-3.11",
    [string]$RuntimeRoot = (Join-Path $PSScriptRoot ".."),
    [string]$WhisperModel = "large-v3-turbo",
    [string]$SummaryModel = "qwen3.5:9b"
)

$ErrorActionPreference = "Stop"
$runtime = (Resolve-Path $RuntimeRoot).Path
$venv = Join-Path $runtime ".venv"

function Invoke-CheckedNativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Command '$FilePath' failed with exit code $exitCode."
    }
}

if (-not (Test-Path $venv)) {
    Invoke-CheckedNativeCommand -FilePath $Python -Arguments @($PythonVersion, "-m", "venv", $venv)
}

$pythonExe = Join-Path $venv "Scripts\python.exe"
Invoke-CheckedNativeCommand -FilePath $pythonExe -Arguments @("-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools<82")
Invoke-CheckedNativeCommand -FilePath $pythonExe -Arguments @("-m", "pip", "install", "-r", (Join-Path $runtime "requirements.txt"))
Invoke-CheckedNativeCommand -FilePath $pythonExe -Arguments @((Join-Path $runtime "scripts\download_models.py"), "--whisper-model", $WhisperModel, "--whisper-download-root", (Join-Path $runtime "models\whisper"), "--summary-model", $SummaryModel)

Write-Host "Runtime ready at $runtime"
