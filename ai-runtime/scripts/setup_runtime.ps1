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

if (-not (Test-Path $venv)) {
    & $Python $PythonVersion -m venv $venv
}

$pythonExe = Join-Path $venv "Scripts\python.exe"
& $pythonExe -m pip install --upgrade pip wheel "setuptools<82"
& $pythonExe -m pip install -r (Join-Path $runtime "requirements.txt")
& $pythonExe (Join-Path $runtime "scripts\download_models.py") --whisper-model $WhisperModel --whisper-download-root (Join-Path $runtime "models\whisper") --summary-model $SummaryModel

Write-Host "Runtime ready at $runtime"
