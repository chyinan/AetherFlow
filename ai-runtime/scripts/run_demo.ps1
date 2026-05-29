param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath,
    [string]$OutputRoot = "outputs",
    [string]$WhisperLanguage = "auto",
    [string]$SummaryLanguage = "Chinese"
)

$ErrorActionPreference = "Stop"
$runtime = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonExe = Join-Path $runtime ".venv\Scripts\python.exe"
Push-Location $runtime
try {
    & $pythonExe -m ai_runtime.cli run --video $VideoPath --output-root $OutputRoot --whisper-language $WhisperLanguage --summary-language $SummaryLanguage
} finally {
    Pop-Location
}
