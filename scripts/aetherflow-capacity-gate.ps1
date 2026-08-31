[CmdletBinding()]
param(
    [string]$Protocol = "http",
    [string]$HostName = "localhost",
    [ValidateRange(1, 65535)][int]$Port = 8080,
    [ValidateRange(1, 10000)][int]$Threads = 100,
    [ValidateRange(1, 3600)][int]$RampUpSeconds = 120,
    [ValidateRange(1, 100000)][int]$Loops = 20,
    [ValidateRange(1, 1440)][int]$SoakMinutes = 30,
    [string]$JMeterPath = "",
    [string]$ResultRoot = "",
    [double]$MaxErrorRatePercent = 1.0,
    [int]$MaxP95Milliseconds = 2000,
    [int]$MaxP99Milliseconds = 5000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runner = Join-Path $PSScriptRoot "aetherflow-run-performance.ps1"
if ([string]::IsNullOrWhiteSpace($ResultRoot)) {
    $ResultRoot = Join-Path $root "performance-test/capacity-results"
}

# 真实容量门禁不允许 mock fallback；脚本只把真实目标的 JTL 和环境快照作为发布证据。
$runnerArgs = @{
    Protocol = $Protocol; HostName = $HostName; Port = $Port; Threads = $Threads
    RampUpSeconds = $RampUpSeconds; Loops = $Loops; SkipUpload = $true
    SkipPreflight = $false; ResultRoot = $ResultRoot
    MaxErrorRatePercent = $MaxErrorRatePercent; MaxP95Milliseconds = $MaxP95Milliseconds
    MaxP99Milliseconds = $MaxP99Milliseconds
}
if (-not [string]::IsNullOrWhiteSpace($JMeterPath)) { $runnerArgs.JMeterPath = $JMeterPath }
& $runner @runnerArgs
if ($LASTEXITCODE -ne 0) { throw "真实容量门禁失败，禁止发布。" }

$runDirectories = @(Get-ChildItem -LiteralPath $ResultRoot -Directory -Filter "run-*" | Sort-Object LastWriteTime -Descending)
$latest = $runDirectories | Select-Object -First 1
if ($null -eq $latest) { throw "未找到容量门禁结果目录。" }
$evidence = [ordered]@{
    target = "${Protocol}://${HostName}:${Port}"
    threads = $Threads
    rampUpSeconds = $RampUpSeconds
    loops = $Loops
    soakMinutes = $SoakMinutes
    generatedAt = [DateTimeOffset]::UtcNow.ToString("O")
    gitCommit = (& git -C $root rev-parse HEAD 2>$null)
    runDirectory = $latest.FullName
    note = "必须另行完成 SoakMinutes 对应的持续运行；默认脚本不会把短跑伪装成浸泡证据。"
}
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $latest.FullName "capacity-evidence.json") -Encoding utf8
Write-Host "真实容量门禁通过，证据目录: $($latest.FullName)"
