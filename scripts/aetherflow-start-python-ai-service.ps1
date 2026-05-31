param(
    [string]$HostName = "0.0.0.0",
    [int]$Port = 8200,
    [switch]$StopExisting,
    [switch]$InstallRequirements
)

$ErrorActionPreference = "Stop"

function Get-EnvOrDefault {
    param(
        [string]$Name,
        [string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$serviceDir = Join-Path $repoRoot "python-ai-service"
$pythonExe = Join-Path $serviceDir ".venv\Scripts\python.exe"
$requirements = Join-Path $serviceDir "requirements.txt"
$outputDir = Join-Path $repoRoot "data\ai-runtime-output"
$outLog = Join-Path $serviceDir "uvicorn.out.log"
$errLog = Join-Path $serviceDir "uvicorn.err.log"

if (-not (Test-Path $pythonExe)) {
    throw "Python venv not found: $pythonExe"
}

if ($InstallRequirements) {
    & $pythonExe -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw "pip install failed with exit code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$ollamaBaseUrl = Get-EnvOrDefault "OLLAMA_BASE_URL" "http://127.0.0.1:11434"
if ($ollamaBaseUrl -match "host\.docker\.internal") {
    $ollamaBaseUrl = "http://127.0.0.1:11434"
}

$fileUrlRewriteTo = Get-EnvOrDefault "FILE_URL_REWRITE_TO" "http://192.168.101.68:9000"
if ($fileUrlRewriteTo -match "://minio(:|/)") {
    $fileUrlRewriteTo = "http://192.168.101.68:9000"
}

if ($StopExisting) {
    Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='powershell.exe' OR name='pwsh.exe'" |
        Where-Object {
            $_.CommandLine -like "*uvicorn app.main:app*" -and
            $_.CommandLine -like "*--port $Port*"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Output "stopped existing python-ai-service process pid=$($_.ProcessId)"
        }
}

$serviceEnv = [ordered]@{
    ENABLE_WHISPER = Get-EnvOrDefault "ENABLE_WHISPER" "true"
    ENABLE_LLM = Get-EnvOrDefault "ENABLE_LLM" "true"
    WHISPER_MODEL = Get-EnvOrDefault "WHISPER_MODEL" "small"
    WHISPER_DEVICE = Get-EnvOrDefault "WHISPER_DEVICE" "cpu"
    WHISPER_COMPUTE_TYPE = Get-EnvOrDefault "WHISPER_COMPUTE_TYPE" "int8"
    OLLAMA_BASE_URL = $ollamaBaseUrl
    FILE_URL_REWRITE_FROM = Get-EnvOrDefault "FILE_URL_REWRITE_FROM" "http://localhost:9000"
    FILE_URL_REWRITE_TO = $fileUrlRewriteTo
    AI_OUTPUT_DIR = Get-EnvOrDefault "AI_OUTPUT_DIR" $outputDir
    FFMPEG_TIMEOUT_SECONDS = Get-EnvOrDefault "FFMPEG_TIMEOUT_SECONDS" "120"
}

foreach ($item in $serviceEnv.GetEnumerator()) {
    Set-Item -Path "Env:$($item.Key)" -Value $item.Value
}

$process = Start-Process `
    -FilePath $pythonExe `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", $HostName, "--port", $Port) `
    -WorkingDirectory $serviceDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

Write-Output "started python-ai-service launcher pid=$($process.Id)"
Write-Output "health: http://127.0.0.1:$Port/health"
Write-Output "status: http://127.0.0.1:$Port/ai/status"
Write-Output "logs: $outLog, $errLog"
Write-Output "whisper: ENABLE_WHISPER=$($serviceEnv.ENABLE_WHISPER), WHISPER_MODEL=$($serviceEnv.WHISPER_MODEL), WHISPER_DEVICE=$($serviceEnv.WHISPER_DEVICE), WHISPER_COMPUTE_TYPE=$($serviceEnv.WHISPER_COMPUTE_TYPE)"
