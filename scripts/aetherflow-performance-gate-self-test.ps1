# pattern: Imperative Shell
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$gateScript = Join-Path $PSScriptRoot "aetherflow-performance-gate.ps1"
$passFixture = Join-Path $repositoryRoot "performance-test/fixtures/gate-pass.jtl"
$failFixture = Join-Path $repositoryRoot "performance-test/fixtures/gate-fail.jtl"
$shellPath = (Get-Process -Id $PID).Path

& $shellPath -NoProfile -File $gateScript `
    -JtlPath $passFixture `
    -MaxErrorRatePercent 0 `
    -MaxP95Milliseconds 500 `
    -MaxP99Milliseconds 500 `
    -MinSamples 10
if ($LASTEXITCODE -ne 0) {
    throw "Performance gate rejected the passing fixture."
}

& $shellPath -NoProfile -File $gateScript `
    -JtlPath $failFixture `
    -MaxErrorRatePercent 0 `
    -MaxP95Milliseconds 500 `
    -MaxP99Milliseconds 500 `
    -MinSamples 10
if ($LASTEXITCODE -eq 0) {
    throw "Performance gate accepted the failing fixture."
}

Write-Host "Performance gate self-test passed."
