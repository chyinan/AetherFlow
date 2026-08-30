# pattern: Imperative Shell
[CmdletBinding()]
param(
    [string]$EnvFile = "",
    [string]$PublicBaseUrl = "http://localhost",
    [switch]$ConfigOnly,
    [switch]$RunPerformanceSmoke,
    [string]$JMeterPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [string]$FailureMessage
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)"
    }
}

function Assert-HttpEndpoint {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
            throw "HTTP $($response.StatusCode)"
        }
        Write-Host "[OK] $Url"
    } catch {
        throw "Deployment health check failed for $Url : $($_.Exception.Message)"
    }
}

function Convert-ComposePsOutput {
    param([string[]]$Lines)

    $content = ($Lines -join "`n").Trim()
    if (-not $content) {
        return @()
    }
    if ($content.StartsWith("[")) {
        return @($content | ConvertFrom-Json)
    }
    return @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object {
        $_ | ConvertFrom-Json
    })
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $repositoryRoot "docker-compose.yml"
$docker = (Get-Command docker -ErrorAction Stop).Source
$composeArguments = @("compose", "--project-directory", $repositoryRoot, "-f", $composeFile)
if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
    $resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
    $composeArguments += @("--env-file", $resolvedEnvFile)
}

Invoke-CheckedCommand $docker ($composeArguments + @("config", "--quiet")) "Docker Compose configuration is invalid"
$services = @(& $docker @composeArguments config --services)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to enumerate Docker Compose services."
}
$criticalServices = @(
    "mysql", "redis", "rabbitmq", "nacos", "gateway-service", "auth-service",
    "workflow-service", "task-service", "ai-service", "file-service", "notify-service", "nginx"
)
$missingServices = @($criticalServices | Where-Object { $_ -notin $services })
if ($missingServices.Count -gt 0) {
    throw "Compose configuration is missing critical services: $($missingServices -join ', ')"
}
Write-Host "Compose configuration passed with $($services.Count) services."

if ($ConfigOnly) {
    Write-Host "Deployment verification completed in config-only mode."
    exit 0
}

Invoke-CheckedCommand $docker @("info", "--format", "{{.ServerVersion}}") "Docker daemon is unavailable"
$runningServices = @(& $docker @composeArguments ps --services --status running)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect running Compose services."
}
$notRunning = @($criticalServices | Where-Object { $_ -notin $runningServices })
if ($notRunning.Count -gt 0) {
    & $docker @composeArguments ps
    throw "Critical services are not running: $($notRunning -join ', ')"
}
$composePsLines = @(& $docker @composeArguments ps --format json)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect Compose container health."
}
$composePs = @(Convert-ComposePsOutput $composePsLines)
$unhealthy = @($composePs | Where-Object {
    $health = [string]$_.Health
    -not [string]::IsNullOrWhiteSpace($health) -and $health -ne "healthy"
})
if ($unhealthy.Count -gt 0) {
    $details = $unhealthy | ForEach-Object { "$($_.Service)=$($_.Health)" }
    throw "Compose contains unhealthy or not-yet-ready containers: $($details -join ', ')"
}

$normalizedBaseUrl = $PublicBaseUrl.TrimEnd('/')
Assert-HttpEndpoint "$normalizedBaseUrl/health"
Assert-HttpEndpoint "$normalizedBaseUrl/api/actuator/health"
Assert-HttpEndpoint "$normalizedBaseUrl/api/gateway/status"

if ($RunPerformanceSmoke) {
    $uri = [Uri]$normalizedBaseUrl
    $port = if ($uri.IsDefaultPort) { if ($uri.Scheme -eq "https") { 443 } else { 80 } } else { $uri.Port }
    $performanceArguments = @{
        Protocol = $uri.Scheme
        HostName = $uri.Host
        Port = $port
        Threads = 2
        RampUpSeconds = 2
        Loops = 1
        SkipUpload = $true
        MaxErrorRatePercent = 0
        MaxP95Milliseconds = 2000
        MaxP99Milliseconds = 5000
    }
    if (-not [string]::IsNullOrWhiteSpace($JMeterPath)) {
        $performanceArguments.JMeterPath = $JMeterPath
    }
    & (Join-Path $PSScriptRoot "aetherflow-run-performance.ps1") @performanceArguments
}

Write-Host "Deployment verification passed."
