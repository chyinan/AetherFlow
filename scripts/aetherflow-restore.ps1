param(
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [string]$ComposeFile = ".\docker-compose.yml",
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
    throw 'Restore overwrites runtime data. Pass -ConfirmRestore after an isolated rehearsal.'
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = (Resolve-Path (Join-Path $root $BackupDirectory)).Path
$manifestPath = Join-Path $target "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'manifest.json is missing' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $path = Join-Path $target $entry.name
    if (-not (Test-Path -LiteralPath $path)) { throw "Backup file is missing: $($entry.name)" }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if ($hash -ne $entry.sha256) { throw "Backup file hash mismatch: $($entry.name)" }
}
$composePath = (Resolve-Path (Join-Path $root $ComposeFile)).Path
& docker compose -f $composePath stop nginx gateway-service auth-service workflow-service task-service ai-service file-service notify-service redis minio
if ($LASTEXITCODE -ne 0) { throw 'Unable to stop stateful services before restore' }
& docker compose -f $composePath up -d mysql redis minio
if ($LASTEXITCODE -ne 0) { throw 'Dependency startup failed' }
Get-Content -LiteralPath (Join-Path $target "mysql-all.sql") -Raw |
    & docker compose -f $composePath exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
if ($LASTEXITCODE -ne 0) { throw 'MySQL restore failed' }

$redisDumpPath = Join-Path $target 'redis.rdb'
if (Test-Path -LiteralPath $redisDumpPath) {
    & docker compose -f $composePath cp $redisDumpPath redis:/data/dump.rdb
    if ($LASTEXITCODE -ne 0) { throw 'Redis RDB copy failed' }
    & docker compose -f $composePath restart redis
    if ($LASTEXITCODE -ne 0) { throw 'Redis restart after restore failed' }
}

$minioDumpPath = Join-Path $target 'minio-data.tar.gz'
if (Test-Path -LiteralPath $minioDumpPath) {
    & docker compose -f $composePath cp $minioDumpPath minio:/tmp/aetherflow-minio-data.tar.gz
    if ($LASTEXITCODE -ne 0) { throw 'MinIO archive copy failed' }
    & docker compose -f $composePath exec -T minio sh -c 'rm -rf /data/* && tar -xzf /tmp/aetherflow-minio-data.tar.gz -C /data'
    if ($LASTEXITCODE -ne 0) { throw 'MinIO archive extraction failed' }
    & docker compose -f $composePath restart minio
    if ($LASTEXITCODE -ne 0) { throw 'MinIO restart after restore failed' }
}
Write-Host 'MySQL, Redis and MinIO restore completed. Validate application health and object checksums before reopening traffic.'
& docker compose -f $composePath up -d auth-service workflow-service task-service ai-service file-service notify-service gateway-service nginx
if ($LASTEXITCODE -ne 0) { throw 'Traffic tier restart after restore failed' }
