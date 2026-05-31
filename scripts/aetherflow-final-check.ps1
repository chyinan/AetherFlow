param(
    [string]$HostName = "192.168.101.68",
    [string]$SshUser = "root",
    [string]$SshPassword = $env:AETHERFLOW_VM_PASSWORD,
    [switch]$SkipSsh,
    [switch]$ApplyNetwork
)

$ErrorActionPreference = "Continue"

function Section([string]$Name) {
    Write-Host ""
    Write-Host "==== $Name ===="
}

function Invoke-HttpCheck([string]$Name, [string]$Url, [int]$TimeoutSec = 5) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        Write-Host "[OK] $Name $Url status=$($response.StatusCode)"
    } catch {
        Write-Host "[FAIL] $Name $Url $($_.Exception.Message)"
    }
}

function Invoke-Remote([string]$Command) {
    if ($SkipSsh) {
        Write-Host "[SKIP] ssh $SshUser@$HostName $Command"
        return
    }
    $ssh = Get-Command ssh -ErrorAction SilentlyContinue
    if (-not $ssh) {
        Write-Host "[WARN] OpenSSH client not found; run this script with -SkipSsh or install OpenSSH."
        return
    }
    ssh -o StrictHostKeyChecking=no "$SshUser@$HostName" $Command
}

Section "Current Environment"
Write-Host "Target VM: $SshUser@$HostName"
Write-Host "Docker network target: aetherflow-network"

Section "Docker Version"
Invoke-Remote "docker version"

Section "Docker Networks"
Invoke-Remote "docker network ls; docker network inspect aetherflow-network 2>/dev/null || true"

if ($ApplyNetwork) {
    Section "Apply Docker Network"
    $containers = "aetherflow-mysql aetherflow-nacos aetherflow-seata aetherflow-elasticsearch aetherflow-kibana aetherflow-redis aetherflow-rabbitmq aetherflow-nginx aetherflow-gateway-service aetherflow-auth-service aetherflow-workflow-service aetherflow-task-service aetherflow-ai-service aetherflow-file-service aetherflow-notify-service aetherflow-python-ai-service"
    Invoke-Remote "docker network create aetherflow-network 2>/dev/null || true; for c in $containers; do docker inspect `$c >/dev/null 2>&1 && docker network connect aetherflow-network `$c 2>/dev/null || true; done"
}

Section "Container Status"
Invoke-Remote "docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'"

Section "Restart Policy"
Invoke-Remote "for c in `$(docker ps -aq); do docker inspect -f '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}} network={{range `$k, `$v := .NetworkSettings.Networks}}{{`$k}} {{end}}' `$c; done"

Section "Volume Mapping"
Invoke-Remote "for c in `$(docker ps -aq); do docker inspect -f '{{.Name}} {{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' `$c; done"

Section "Port Exposure"
Invoke-Remote "docker ps --format '{{.Names}} {{.Ports}}'; ss -lntup | egrep ':(80|3306|3307|6379|5672|15672|8848|9848|9849|8091|8858|9200|5601|8080|8101|8102|8103|8104|8105|8106|8200|9000|9001)\b' || true"

Section "MySQL Checks"
$mysqlSql = "SHOW VARIABLES WHERE Variable_name IN ('character_set_server','collation_server','time_zone','max_connections','log_bin','binlog_format'); SHOW DATABASES LIKE 'aetherflow%'; USE aetherflow; SHOW TABLES LIKE 'undo_log'; SHOW TABLES LIKE 'global_table';"
Invoke-Remote "docker exec aetherflow-mysql mysql -uroot -pmysql -e `"$mysqlSql`""

Section "Nacos Checks"
Invoke-HttpCheck "Nacos readiness" "http://${HostName}:8848/nacos/v1/console/health/readiness"
Invoke-HttpCheck "Nacos service list" "http://${HostName}:8848/nacos/v1/ns/service/list?pageNo=1&pageSize=50"

Section "Seata Checks"
Invoke-Remote "docker logs --tail=120 aetherflow-seata 2>&1 | egrep -i 'started|nacos|mysql|register|error|exception' || true"

Section "Sentinel Checks"
Invoke-HttpCheck "Sentinel dashboard" "http://${HostName}:8858/"

Section "Gateway and OpenAPI"
Invoke-HttpCheck "Gateway health" "http://${HostName}:8080/actuator/health"
foreach ($path in @("auth","workflows","tasks","ai","files","notify")) {
    Invoke-HttpCheck "$path OpenAPI" "http://${HostName}:8080/$path/v3/api-docs"
}

Section "Nginx"
Invoke-HttpCheck "Nginx health" "http://$HostName/health"
Invoke-HttpCheck "Nginx API via gateway" "http://$HostName/api/actuator/health"

Section "AI Runtime"
Invoke-HttpCheck "Python AI health" "http://${HostName}:8200/health"
Invoke-HttpCheck "Python AI status" "http://${HostName}:8200/ai/status"

Section "Ollama"
Invoke-HttpCheck "Ollama tags" "http://localhost:11434/api/tags"

Section "RabbitMQ"
Invoke-HttpCheck "RabbitMQ management" "http://${HostName}:15672/"
Invoke-Remote "docker exec aetherflow-rabbitmq rabbitmqctl list_queues name durable messages messages_ready messages_unacknowledged consumers"

Section "Redis"
Invoke-Remote "docker exec aetherflow-redis redis-cli ping"

Section "SSE and WebSocket Readiness"
Write-Host "SSE check: curl -N --max-time 15 http://$HostName/sse/notify/sse/10001"
Write-Host "WebSocket check: use browser/devtool or websocat ws://$HostName/ws/notify/ws?userId=10001"
