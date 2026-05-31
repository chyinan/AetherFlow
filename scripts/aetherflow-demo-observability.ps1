param(
    [string]$BaseUrl = "http://192.168.101.68:8080",
    [string]$SentinelUrl = "http://192.168.101.68:9090",
    [string]$SeataUrl = "http://192.168.101.68:7099",
    [string]$Username = "aether.operator",
    [string]$Password = "mock-password",
    [int]$Rounds = 5,
    [int]$SeataHoldSeconds = 15,
    [switch]$Rollback,
    [switch]$SkipSeata,
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: powershell -File scripts/aetherflow-demo-observability.ps1 [-BaseUrl http://host:8080] [-Rounds 5] [-SeataHoldSeconds 15] [-Rollback] [-SkipSeata]"
    Write-Output "Creates Sentinel traffic through Gateway and optionally opens a short Seata global transaction."
    exit 0
}

function Invoke-DemoRequest {
    param(
        [string]$Method = "GET",
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )

    $uri = "$BaseUrl$Path"
    try {
        $options = @{
            Method = $Method
            Uri = $uri
            Headers = $Headers
            TimeoutSec = 30
            UseBasicParsing = $true
        }
        if ($null -ne $Body) {
            $options.ContentType = "application/json"
            $options.Body = ($Body | ConvertTo-Json -Depth 8)
        }
        $response = Invoke-WebRequest @options
        Write-Host ("{0} {1} -> {2}" -f $Method, $Path, [int]$response.StatusCode)
        return $response
    } catch {
        $status = "ERR"
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        Write-Host ("{0} {1} -> {2} {3}" -f $Method, $Path, $status, $_.Exception.Message)
        return $null
    }
}

Write-Output "AetherFlow observability demo"
Write-Output "Gateway:  $BaseUrl"
Write-Output "Sentinel: $SentinelUrl"
Write-Output "Seata:    $SeataUrl"

$token = $null
$login = Invoke-DemoRequest -Method "POST" -Path "/auth/login" -Body @{
    username = $Username
    password = $Password
}
if ($login -and $login.Content) {
    $json = $login.Content | ConvertFrom-Json
    if ($json.data -and $json.data.accessToken) {
        $token = $json.data.accessToken
        Write-Output "Login token acquired for $Username"
    }
}

$headers = @{}
if ($token) {
    $headers.Authorization = "Bearer $token"
}

for ($i = 1; $i -le $Rounds; $i++) {
    Write-Output ""
    Write-Output "Round $i/$Rounds"
    $null = Invoke-DemoRequest -Path "/gateway/status"
    $null = Invoke-DemoRequest -Path "/auth/status"
    $null = Invoke-DemoRequest -Path "/ai/status" -Headers $headers
    $null = Invoke-DemoRequest -Path "/tasks/v3/api-docs"
    $null = Invoke-DemoRequest -Path "/workflow/node/catalog" -Headers $headers
    $null = Invoke-DemoRequest -Path "/workflow/runtime/metrics" -Headers $headers
    $null = Invoke-DemoRequest -Path "/files/v3/api-docs"
}

if (-not $SkipSeata) {
    Write-Output ""
    Write-Output "Opening Seata demo transaction for $SeataHoldSeconds seconds. Open TransactionInfo while this request is running."
    $seataPath = "/workflow/demo/seata-transaction?holdSeconds=$SeataHoldSeconds&rollback=$($Rollback.IsPresent.ToString().ToLowerInvariant())"
    $null = Invoke-DemoRequest -Method "POST" -Path $seataPath -Headers $headers
}

Write-Output ""
Write-Output "Check Sentinel apps: gateway-service, auth-service, workflow-service, task-service, ai-service, file-service"
Write-Output "Sentinel Dashboard: $SentinelUrl"
Write-Output "Seata TransactionInfo: $SeataUrl/#/TransactionInfo"
