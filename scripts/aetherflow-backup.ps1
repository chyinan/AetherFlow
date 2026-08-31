param(
    [string]$OutputDirectory = ".\backups",
    [string]$ComposeFile = ".\docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$composePath = (Resolve-Path (Join-Path $root $ComposeFile)).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = (Join-Path $root $OutputDirectory)
$target = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Path $target -Force | Out-Null

function Invoke-Compose {
    param([string[]]$Arguments)
    & docker compose -f $composePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose command failed: $($Arguments -join ' ')"
    }
}

Write-Host ("Backup directory: " + $target)
Invoke-Compose @("exec", "-T", "mysql", "sh", "-c", 'mysqldump --single-transaction --routines --events --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" --all-databases') |
    Set-Content -LiteralPath (Join-Path $target "mysql-all.sql") -Encoding utf8

$redisDump = Join-Path $target "redis.rdb"
$redisCommand = 'docker compose -f "' + $composePath + '" exec -T redis sh -c "redis-cli --no-auth-warning -a $REDIS_PASSWORD --rdb -" > "' + $redisDump + '"'
& cmd.exe /d /c $redisCommand
if ($LASTEXITCODE -ne 0) { throw "Redis RDB snapshot failed" }

# MinIO 单节点快照只能作为同一时刻的恢复材料；生产应把该目录替换成分布式 MinIO 复制/版本化策略。
$minioDump = Join-Path $target "minio-data.tar.gz"
$minioCommand = 'docker compose -f "' + $composePath + '" exec -T minio sh -c "tar -C /data -czf - ." > "' + $minioDump + '"'
& cmd.exe /d /c $minioCommand
if ($LASTEXITCODE -ne 0) { throw "MinIO snapshot failed" }

$manifest = [ordered]@{
    createdAt = [DateTimeOffset]::Now.ToString("o")
    gitCommit = (& git -C $root rev-parse HEAD 2>$null)
    composeFile = $composePath
    files = Get-ChildItem -LiteralPath $target -File | ForEach-Object {
        [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "manifest.json") -Encoding utf8
Write-Host 'Backup completed. Verify manifest hashes and rehearse restore in an isolated environment.'
