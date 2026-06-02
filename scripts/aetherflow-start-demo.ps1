param(
    [string]$VmHost = "192.168.101.68",
    [string]$VmUser = "root",
    [string]$VmPassword = $env:AETHERFLOW_VM_PASSWORD,
    [string]$VmHostKey = "SHA256:PqcsntLvegnKK6GW2YYclSshvzB62IkXb/2CLntxZ2Y",
    [int]$PythonAiPort = 8200,
    [switch]$InstallPythonRequirements,
    [switch]$RestartLocalAi,
    [switch]$RestartTunnel,
    [switch]$SkipLocalAi,
    [switch]$SkipTunnel,
    [switch]$SkipVmContainers,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonAiScript = Join-Path $PSScriptRoot "aetherflow-start-python-ai-service.ps1"
$tunnelSpec = "0.0.0.0:${PythonAiPort}:127.0.0.1:${PythonAiPort}"

function Write-Step {
    param([string]$Message)
    Write-Output ""
    Write-Output "==== $Message ===="
}

function Get-ExecutablePath {
    param(
        [string]$Name,
        [string[]]$FallbackPaths = @()
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    foreach ($path in $FallbackPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    throw "$Name not found. Add it to PATH or install it first."
}

function Test-Http {
    param(
        [string]$Url,
        [int]$TimeoutSec = 5
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Invoke-Plink {
    param([string]$Command)

    $plink = Get-ExecutablePath "plink.exe"
    & $plink -ssh "$VmUser@$VmHost" -pw $VmPassword -batch -hostkey $VmHostKey $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Remote command failed with exit code $LASTEXITCODE"
    }
}

function Start-OllamaIfNeeded {
    if (Test-Http "http://127.0.0.1:11434/api/tags" 3) {
        Write-Output "Ollama already reachable at http://127.0.0.1:11434"
        return
    }

    $ollama = Get-ExecutablePath "ollama.exe" @(
        (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
        (Join-Path $env:LOCALAPPDATA "Ollama\ollama.exe")
    )
    Start-Process -FilePath $ollama -ArgumentList @("serve") -WindowStyle Hidden | Out-Null

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        if (Test-Http "http://127.0.0.1:11434/api/tags" 3) {
            Write-Output "Ollama started and reachable"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "Ollama did not become reachable at http://127.0.0.1:11434"
}

function Start-LocalPythonAi {
    if (-not (Test-Path $pythonAiScript)) {
        throw "Missing script: $pythonAiScript"
    }

    $shouldStopExisting = [bool]$RestartLocalAi
    if (-not $RestartLocalAi -and (Test-Http "http://127.0.0.1:$PythonAiPort/health" 3)) {
        try {
            $status = Invoke-RestMethod -Uri "http://127.0.0.1:$PythonAiPort/ai/status" -TimeoutSec 5
            if ($status.whisperEnabled -eq $true -and $status.whisperRuntimeReady -eq $true) {
                Write-Output "python-ai-service already reachable with real Whisper at http://127.0.0.1:$PythonAiPort"
                return
            }
            Write-Output "python-ai-service is reachable but real Whisper is not ready; restarting it"
            $shouldStopExisting = $true
        } catch {
            Write-Output "python-ai-service health is reachable but status check failed; restarting it"
            $shouldStopExisting = $true
        }
    }

    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $pythonAiScript)
    if ($shouldStopExisting) {
        $arguments += "-StopExisting"
    }
    if ($InstallPythonRequirements) {
        $arguments += "-InstallRequirements"
    }

    & powershell @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "python-ai-service start failed with exit code $LASTEXITCODE"
    }

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        if (Test-Http "http://127.0.0.1:$PythonAiPort/health" 3) {
            Write-Output "python-ai-service reachable at http://127.0.0.1:$PythonAiPort"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "python-ai-service did not become reachable at http://127.0.0.1:$PythonAiPort"
}

function Start-ReverseTunnel {
    $plink = Get-ExecutablePath "plink.exe"
    $existingTunnel = Get-CimInstance Win32_Process -Filter "name='plink.exe'" |
        Where-Object { $_.CommandLine -like "*$tunnelSpec*" -and $_.CommandLine -like "*$VmHost*" }

    if ($RestartTunnel) {
        $existingTunnel | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Output "stopped existing SSH tunnel pid=$($_.ProcessId)"
        }
        $existingTunnel = @()
    }

    if (-not $existingTunnel) {
        Start-Process `
            -FilePath $plink `
            -ArgumentList @("-ssh", "$VmUser@$VmHost", "-pw", $VmPassword, "-batch", "-hostkey", $VmHostKey, "-N", "-R", $tunnelSpec) `
            -WindowStyle Hidden `
            -PassThru | Out-Null
        Write-Output "started SSH reverse tunnel: VM ${VmHost}:$PythonAiPort -> Windows 127.0.0.1:$PythonAiPort"
    } else {
        Write-Output "SSH reverse tunnel already running"
    }

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        try {
            Invoke-Plink "curl -fsS http://127.0.0.1:$PythonAiPort/health >/dev/null"
            Write-Output "VM can reach python-ai-service through tunnel"
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    throw "VM cannot reach python-ai-service through SSH reverse tunnel"
}

function Start-VmContainers {
    $remoteScript = @'
set -e

systemctl start docker >/dev/null 2>&1 || true
docker network create aetherflow-network >/dev/null 2>&1 || true

start_if_exists() {
  for container in "$@"; do
    if docker inspect "$container" >/dev/null 2>&1; then
      docker start "$container" >/dev/null 2>&1 || true
      printf "started-or-running %s\n" "$container"
    else
      printf "missing %s\n" "$container"
    fi
  done
}

start_if_exists mysql aetherflow-redis aetherflow-rabbitmq nacos2.4.0.1
start_if_exists elasticsearch7.17.7 kibana7.17.7 aetherflow-minio
start_if_exists seata1.5.2 aetherflow-sentinel-dashboard
sleep 8
start_if_exists aetherflow-auth-service aetherflow-file-service aetherflow-task-service aetherflow-notify-service aetherflow-ai-service aetherflow-workflow-service
sleep 8
start_if_exists aetherflow-gateway-service aetherflow-nginx

docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | egrep '^(NAMES|mysql|nacos2.4.0.1|seata1.5.2|elasticsearch7.17.7|kibana7.17.7|aetherflow-)'
'@

    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
    Invoke-Plink "echo '$encoded' | base64 -d >/tmp/aetherflow-start-demo.sh && bash /tmp/aetherflow-start-demo.sh"
}

function Invoke-DemoChecks {
    $checks = @(
        @{ Name = "Frontend"; Url = "http://$VmHost/" },
        @{ Name = "Nginx health"; Url = "http://$VmHost/health" },
        @{ Name = "Gateway via Nginx"; Url = "http://$VmHost/api/actuator/health" },
        @{ Name = "AI service"; Url = "http://${VmHost}:8104/actuator/health" },
        @{ Name = "Python AI status"; Url = "http://${VmHost}:$PythonAiPort/ai/status" }
    )

    foreach ($check in $checks) {
        try {
            $response = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 10
            Write-Output "[OK] $($check.Name) $($check.Url) status=$($response.StatusCode)"
        } catch {
            Write-Output "[FAIL] $($check.Name) $($check.Url) $($_.Exception.Message)"
        }
    }

    try {
        $status = Invoke-RestMethod -Uri "http://${VmHost}:$PythonAiPort/ai/status" -TimeoutSec 10
        Write-Output "Python AI whisperEnabled=$($status.whisperEnabled), whisperRuntimeReady=$($status.whisperRuntimeReady), ffmpegAvailable=$($status.ffmpegAvailable)"
    } catch {
        Write-Output "[FAIL] Python AI status detail $($_.Exception.Message)"
    }
}

Set-Location $repoRoot

Write-Step "AetherFlow Demo Startup"
Write-Output "VM: $VmUser@$VmHost"
Write-Output "Frontend: http://$VmHost/"
Write-Output "Gateway API: http://$VmHost/api"

if (-not $SkipLocalAi) {
    Write-Step "Windows Ollama"
    Start-OllamaIfNeeded

    Write-Step "Windows Python AI Runtime"
    Start-LocalPythonAi
}

if (-not $SkipVmContainers) {
    Write-Step "VM Docker Containers"
    Start-VmContainers
}

if (-not $SkipTunnel) {
    Write-Step "AI Runtime Reverse SSH Tunnel"
    Start-ReverseTunnel
}

if (-not $SkipChecks) {
    Write-Step "Final Checks"
    Invoke-DemoChecks
}

Write-Step "Access"
Write-Output "Frontend: http://$VmHost/"
Write-Output "Gateway health: http://$VmHost/api/actuator/health"
Write-Output "Nacos: http://${VmHost}:8848/nacos"
Write-Output "RabbitMQ: http://${VmHost}:15672"
Write-Output "MinIO: http://${VmHost}:9001"
Write-Output "Sentinel: http://${VmHost}:8858"
