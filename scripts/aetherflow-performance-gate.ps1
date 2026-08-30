# pattern: Imperative Shell
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$JtlPath,
    [ValidateRange(0, 100)]
    [double]$MaxErrorRatePercent = 1.0,
    [ValidateRange(1, 3600000)]
    [int]$MaxP95Milliseconds = 2000,
    [ValidateRange(1, 3600000)]
    [int]$MaxP99Milliseconds = 5000,
    [ValidateRange(1, 100000000)]
    [int]$MinSamples = 10,
    [string]$SummaryJsonPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Percentile {
    param(
        [double[]]$Values,
        [ValidateRange(0, 100)]
        [double]$Percentile
    )

    if (-not $Values -or $Values.Count -eq 0) {
        return 0.0
    }
    $sorted = @($Values | Sort-Object)
    $rank = [Math]::Ceiling(($Percentile / 100.0) * $sorted.Count)
    $index = [Math]::Max(0, [Math]::Min($sorted.Count - 1, $rank - 1))
    return [double]$sorted[$index]
}

function Convert-ToElapsedMilliseconds {
    param([object]$Value)

    $elapsed = 0.0
    $parsed = [double]::TryParse(
        [string]$Value,
        [Globalization.NumberStyles]::Float,
        [Globalization.CultureInfo]::InvariantCulture,
        [ref]$elapsed
    )
    if (-not $parsed -or $elapsed -lt 0) {
        throw "JTL contains an invalid elapsed value: '$Value'"
    }
    return $elapsed
}

$resolvedJtlPath = (Resolve-Path -LiteralPath $JtlPath).Path
$rows = @(Import-Csv -LiteralPath $resolvedJtlPath)
if ($rows.Count -eq 0) {
    throw "Performance gate cannot evaluate an empty JTL file: $resolvedJtlPath"
}

$failedRows = @($rows | Where-Object { [string]$_.success -notmatch '^(?i:true)$' })
$httpRows = @($rows | Where-Object {
    $url = [string]$_.URL
    -not [string]::IsNullOrWhiteSpace($url) -and $url -ne "null"
})
if ($httpRows.Count -eq 0) {
    throw "Performance gate found no HTTP samples in: $resolvedJtlPath"
}

$httpElapsed = @($httpRows | ForEach-Object { Convert-ToElapsedMilliseconds $_.elapsed })
$errorRatePercent = [Math]::Round(($failedRows.Count * 100.0) / $rows.Count, 4)
$p95 = [Math]::Round((Get-Percentile -Values $httpElapsed -Percentile 95), 2)
$p99 = [Math]::Round((Get-Percentile -Values $httpElapsed -Percentile 99), 2)

$labelSummaries = @($httpRows | Group-Object label | ForEach-Object {
    $labelRows = @($_.Group)
    $labelElapsed = @($labelRows | ForEach-Object { Convert-ToElapsedMilliseconds $_.elapsed })
    [ordered]@{
        label = $_.Name
        samples = $labelRows.Count
        failures = @($labelRows | Where-Object { [string]$_.success -notmatch '^(?i:true)$' }).Count
        p95Milliseconds = [Math]::Round((Get-Percentile -Values $labelElapsed -Percentile 95), 2)
        p99Milliseconds = [Math]::Round((Get-Percentile -Values $labelElapsed -Percentile 99), 2)
    }
})

$violations = [Collections.Generic.List[string]]::new()
if ($rows.Count -lt $MinSamples) {
    $violations.Add("sample count $($rows.Count) is below minimum $MinSamples")
}
if ($errorRatePercent -gt $MaxErrorRatePercent) {
    $violations.Add("error rate $errorRatePercent% exceeds $MaxErrorRatePercent%")
}
if ($p95 -gt $MaxP95Milliseconds) {
    $violations.Add("HTTP p95 ${p95}ms exceeds ${MaxP95Milliseconds}ms")
}
if ($p99 -gt $MaxP99Milliseconds) {
    $violations.Add("HTTP p99 ${p99}ms exceeds ${MaxP99Milliseconds}ms")
}

$summary = [ordered]@{
    jtlPath = $resolvedJtlPath
    evaluatedAt = [DateTimeOffset]::UtcNow.ToString("O")
    passed = $violations.Count -eq 0
    sampleCount = $rows.Count
    httpSampleCount = $httpRows.Count
    failureCount = $failedRows.Count
    errorRatePercent = $errorRatePercent
    p95Milliseconds = $p95
    p99Milliseconds = $p99
    thresholds = [ordered]@{
        maxErrorRatePercent = $MaxErrorRatePercent
        maxP95Milliseconds = $MaxP95Milliseconds
        maxP99Milliseconds = $MaxP99Milliseconds
        minSamples = $MinSamples
    }
    violations = @($violations)
    failedLabels = @($failedRows | Group-Object label | Sort-Object Count -Descending | ForEach-Object {
        [ordered]@{ label = $_.Name; count = $_.Count }
    })
    labels = $labelSummaries
}

if (-not [string]::IsNullOrWhiteSpace($SummaryJsonPath)) {
    $summaryPath = [IO.Path]::GetFullPath($SummaryJsonPath)
    $summaryDirectory = Split-Path -Parent $summaryPath
    if (-not [string]::IsNullOrWhiteSpace($summaryDirectory)) {
        New-Item -ItemType Directory -Force -Path $summaryDirectory | Out-Null
    }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding utf8
}

Write-Host "Performance gate: samples=$($rows.Count) http=$($httpRows.Count) failures=$($failedRows.Count) errorRate=$errorRatePercent% p95=${p95}ms p99=${p99}ms"
$labelSummaries | ForEach-Object {
    Write-Host "  $($_.label): samples=$($_.samples) failures=$($_.failures) p95=$($_.p95Milliseconds)ms p99=$($_.p99Milliseconds)ms"
}

if ($violations.Count -gt 0) {
    $violations | ForEach-Object { Write-Error "Performance gate violation: $_" }
    exit 1
}

Write-Host "Performance gate passed."
exit 0
