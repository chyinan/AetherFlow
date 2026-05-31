param(
    [string]$NacosBaseUrl = "http://192.168.101.68:8848",
    [string]$DataId = "seataServer.properties",
    [string]$Group = "SEATA_GROUP",
    [string]$ConfigPath = "docker/seata/seataServer.properties"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ConfigPath)) {
    throw "Seata config not found: $ConfigPath"
}

$content = Get-Content -Raw $ConfigPath
$body = @{
    dataId = $DataId
    group = $Group
    content = $content
    type = "properties"
}

$response = Invoke-WebRequest `
    -Uri "$NacosBaseUrl/nacos/v1/cs/configs" `
    -Method Post `
    -Body $body `
    -UseBasicParsing `
    -TimeoutSec 10

Write-Host "Nacos import response: $($response.Content)"
