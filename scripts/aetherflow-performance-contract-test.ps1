# pattern: Imperative Shell
[CmdletBinding()]
param(
    [string]$JMeterPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mockServer = Join-Path $repositoryRoot "performance-test/mock-gateway-server.mjs"
$runner = Join-Path $PSScriptRoot "aetherflow-run-performance.ps1"
$node = (Get-Command node -ErrorAction Stop).Source
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("aetherflow-performance-contract-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$serverProcess = $null

try {
    $serverProcess = Start-Process `
        -FilePath $node `
        -ArgumentList @($mockServer, "--port", [string]$port) `
        -PassThru `
        -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt += 1) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $ready) {
        throw "Mock gateway did not become ready on port $port."
    }

    $arguments = @{
        Protocol = "http"
        HostName = "127.0.0.1"
        Port = $port
        Threads = 1
        RampUpSeconds = 0
        Loops = 1
        SkipUpload = $true
        ResultRoot = $temporaryRoot
        MaxErrorRatePercent = 0
        MaxP95Milliseconds = 1000
        MaxP99Milliseconds = 2000
    }
    if (-not [string]::IsNullOrWhiteSpace($JMeterPath)) {
        $arguments.JMeterPath = $JMeterPath
    }
    & $runner @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "JMeter contract test failed with exit code $LASTEXITCODE."
    }

    Write-Host "JMeter contract test passed against the deterministic mock gateway."
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $systemTemporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemporaryRoot.StartsWith($systemTemporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
