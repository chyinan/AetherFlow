# pattern: Imperative Shell

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$examplePath = Join-Path $repoRoot '.env.example'
$envPath = Join-Path $repoRoot '.env'

function New-SecureSecret {
    param([int]$ByteLength = 48)

    $bytes = New-Object byte[] $ByteLength
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }

    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-EnvValue {
    param(
        [string]$Content,
        [string]$Name,
        [string]$Value
    )

    $line = "$Name=$Value"
    $pattern = "(?m)^$([Regex]::Escape($Name))=.*$"
    if ([Regex]::IsMatch($Content, $pattern)) {
        return [Regex]::Replace($Content, $pattern, $line)
    }
    return "$($Content.TrimEnd())`r`n$line`r`n"
}

function Get-EnvValue {
    param(
        [string]$Content,
        [string]$Name
    )

    $pattern = "(?m)^$([Regex]::Escape($Name))=(.*)$"
    $match = [Regex]::Match($Content, $pattern)
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups[1].Value.Trim()
}

function Set-SecureEnvValue {
    param(
        [string]$Content,
        [string]$Name,
        [string[]]$WeakValues
    )

    $currentValue = Get-EnvValue $Content $Name
    if ($currentValue -and $currentValue.Length -ge 32 -and $WeakValues -notcontains $currentValue) {
        return $Content
    }
    return Set-EnvValue $Content $Name (New-SecureSecret)
}

if (Test-Path -LiteralPath $envPath) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $envPath
} elseif (Test-Path -LiteralPath $examplePath) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $examplePath
} else {
    throw "Missing environment template: $examplePath"
}

$content = Set-SecureEnvValue $content 'JWT_SECRET' @('aetherflow-dev-secret-key-change-me-32bytes-minimum')
$content = Set-SecureEnvValue $content 'JWT_REFRESH_SECRET' @('aetherflow-refresh-secret-change-me-32bytes-minimum')
$content = Set-SecureEnvValue $content 'GITHUB_OAUTH_STATE_SECRET' @('aetherflow-github-oauth-state-secret-32bytes')
$content = Set-SecureEnvValue $content 'MYSQL_ROOT_PASSWORD' @('mysql', 'change-me-mysql-root-password')
$content = Set-EnvValue $content 'MYSQL_PASSWORD' (Get-EnvValue $content 'MYSQL_ROOT_PASSWORD')
$content = Set-EnvValue $content 'DB_PASSWORD' (Get-EnvValue $content 'MYSQL_ROOT_PASSWORD')
$content = Set-SecureEnvValue $content 'REDIS_PASSWORD' @('aetherflow', 'change-me-redis-password')
$content = Set-SecureEnvValue $content 'RABBITMQ_PASSWORD' @('aetherflow', 'change-me-rabbitmq-password')
$content = Set-EnvValue $content 'RABBITMQ_MANAGEMENT_PASSWORD' (Get-EnvValue $content 'RABBITMQ_PASSWORD')
$content = Set-SecureEnvValue $content 'MINIO_ACCESS_KEY' @('minioadmin', 'aetherflow')
$content = Set-SecureEnvValue $content 'MINIO_SECRET_KEY' @('minioadmin', 'change-me-minio-secret-key')
$content = Set-SecureEnvValue $content 'ELASTIC_PASSWORD' @('aetherflow', 'change-me-elastic-strong-password')
$content = Set-SecureEnvValue $content 'NACOS_AUTH_TOKEN' @('SecretKey012345678901234567890123456789012345678901234567890123456789')
$content = Set-SecureEnvValue $content 'NACOS_AUTH_IDENTITY_VALUE' @('nacos', 'change-me-server-identity-value')
$content = Set-SecureEnvValue $content 'NACOS_PASSWORD' @('nacos', 'change-me-nacos-password')
$content = Set-SecureEnvValue $content 'FILE_INTERNAL_TOKEN' @('aetherflow-file-internal-dev-token')
$content = Set-SecureEnvValue $content 'TASK_INTERNAL_TOKEN' @('aetherflow-task-internal-dev-token')
$content = Set-SecureEnvValue $content 'AI_INTERNAL_TOKEN' @('aetherflow-ai-internal-dev-token')
$content = Set-SecureEnvValue $content 'NOTIFY_INTERNAL_TOKEN' @('aetherflow-notify-internal-dev-token')
$content = Set-SecureEnvValue $content 'AI_SERVICE_API_KEY' @('aetherflow-ai-service-config-dev-key')
$content = Set-EnvValue $content 'VITE_MOCK_FALLBACK' 'false'
$content = Set-EnvValue $content 'WORKFLOW_OCR_MOCK' 'false'
$content = Set-EnvValue $content 'WORKFLOW_OCR_PROVIDER' 'tesseract'

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $content, $utf8WithoutBom)
Write-Output "Environment initialized: $envPath"
Write-Output 'Secrets were not printed. Existing strong secrets were preserved; missing or weak defaults were replaced.'
