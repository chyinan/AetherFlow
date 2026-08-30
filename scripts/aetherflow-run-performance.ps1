# pattern: Imperative Shell
[CmdletBinding()]
param(
    [string]$Protocol = "http",
    [string]$HostName = "localhost",
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [ValidateRange(1, 10000)]
    [int]$Threads = 10,
    [ValidateRange(0, 3600)]
    [int]$RampUpSeconds = 20,
    [ValidateRange(1, 100000)]
    [int]$Loops = 3,
    [switch]$SkipUpload,
    [switch]$SkipPreflight,
    [string]$JMeterPath = "",
    [string]$ResultRoot = "",
    [ValidateRange(0, 100)]
    [double]$MaxErrorRatePercent = 1.0,
    [ValidateRange(1, 3600000)]
    [int]$MaxP95Milliseconds = 2000,
    [ValidateRange(1, 3600000)]
    [int]$MaxP99Milliseconds = 5000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-JMeterExecutable {
    param([string]$ExplicitPath)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $resolved = (Resolve-Path -LiteralPath $ExplicitPath).Path
        return $resolved
    }
    foreach ($name in @("jmeter.bat", "jmeter")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }
    $knownWindowsPath = "D:\Tools\apache-jmeter-5.6.3\bin\jmeter.bat"
    if (Test-Path -LiteralPath $knownWindowsPath) {
        return $knownWindowsPath
    }
    throw "Apache JMeter was not found. Install JMeter 5.6.3+ or pass -JMeterPath."
}

function Assert-HttpEndpoint {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
            throw "HTTP $($response.StatusCode)"
        }
    } catch {
        throw "Performance preflight failed for $Url : $($_.Exception.Message)"
    }
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$testPlan = Join-Path $repositoryRoot "performance-test/aetherflow-core-api.jmx"
$uploadFile = Join-Path $repositoryRoot "performance-test/data/sample-upload.txt"
$gateScript = Join-Path $PSScriptRoot "aetherflow-performance-gate.ps1"
$jmeter = Resolve-JMeterExecutable $JMeterPath

if (-not $SkipPreflight) {
    Assert-HttpEndpoint "${Protocol}://${HostName}:${Port}/health"
    Assert-HttpEndpoint "${Protocol}://${HostName}:${Port}/gateway/status"
}
if (-not $SkipUpload -and -not (Test-Path -LiteralPath $uploadFile)) {
    throw "Upload scenario is enabled but its fixture is missing: $uploadFile"
}

if ([string]::IsNullOrWhiteSpace($ResultRoot)) {
    $ResultRoot = Join-Path $repositoryRoot "performance-test/results"
}
$resolvedResultRoot = [IO.Path]::GetFullPath($ResultRoot)
New-Item -ItemType Directory -Force -Path $resolvedResultRoot | Out-Null
$timestamp = [DateTimeOffset]::Now.ToString("yyyyMMdd-HHmmss")
$runDirectory = Join-Path $resolvedResultRoot "run-$timestamp"
$reportDirectory = Join-Path $runDirectory "html-report"
$jtlPath = Join-Path $runDirectory "aetherflow-core-api.jtl"
$summaryPath = Join-Path $runDirectory "performance-gate-summary.json"
New-Item -ItemType Directory -Path $runDirectory | Out-Null

$skipUploadValue = if ($SkipUpload) { "true" } else { "false" }
$jmeterArguments = @(
    "-n",
    "-t", $testPlan,
    "-l", $jtlPath,
    "-e", "-o", $reportDirectory,
    "-Jprotocol=$Protocol",
    "-Jhost=$HostName",
    "-Jport=$Port",
    "-Jthreads=$Threads",
    "-Jramp_up=$RampUpSeconds",
    "-Jloops=$Loops",
    "-Jthink_time_ms=0",
    "-Jskip_upload=$skipUploadValue",
    "-Jupload_file_path=$uploadFile"
)

Write-Host "Running JMeter plan: $testPlan"
Write-Host "Target: ${Protocol}://${HostName}:${Port}; threads=$Threads rampUp=${RampUpSeconds}s loops=$Loops skipUpload=$skipUploadValue"
& $jmeter @jmeterArguments
if ($LASTEXITCODE -ne 0) {
    throw "JMeter exited with code $LASTEXITCODE. Results: $runDirectory"
}

$minimumSamples = [Math]::Max(10, $Threads * $Loops * 10)
& $gateScript `
    -JtlPath $jtlPath `
    -MaxErrorRatePercent $MaxErrorRatePercent `
    -MaxP95Milliseconds $MaxP95Milliseconds `
    -MaxP99Milliseconds $MaxP99Milliseconds `
    -MinSamples $minimumSamples `
    -SummaryJsonPath $summaryPath
if ($LASTEXITCODE -ne 0) {
    throw "Performance thresholds failed. Summary: $summaryPath"
}

Write-Host "Performance run passed."
Write-Host "JTL: $jtlPath"
Write-Host "Gate summary: $summaryPath"
Write-Host "HTML report: $reportDirectory"
