# AetherFlow Project Structure

```text
AetherFlow/
  pom.xml
  docker-compose.yml
  docker/
    java-service.Dockerfile
    mysql/init/01-aetherflow.sql
  backend/
    common/
      src/main/java/com/aetherflow/common/
        core/
        dto/
        exception/
        security/
        web/
    gateway-service/
    auth-service/
    workflow-service/
    task-service/
    ai-service/
    file-service/
    notify-service/
  frontend/
  python-ai-service/
    Dockerfile
    requirements.txt
    app/main.py
  ai-runtime/
    requirements.txt
    ai_runtime/
    scripts/
```

## Service Responsibility

| Service | Responsibility |
| --- | --- |
| gateway-service | JWT validation, Sentinel gateway integration, service routing through Nacos discovery |
| auth-service | Registration, login, JWT issuing, default RBAC role assignment |
| workflow-service | DAG definition, workflow instance lifecycle, Activiti engine bootstrap |
| task-service | RabbitMQ dispatch, Redis task state cache, XXL-Job compensation hook, DLQ declarations |
| ai-service | AI task consumer, Python FastAPI bridge, result metadata and notification publishing |
| file-service | MinIO upload and file metadata persistence |
| notify-service | WebSocket/SSE push and notification persistence |
| python-ai-service | Service-facing FastAPI AI runtime wrapper for Whisper/OpenAI/Ollama/FFmpeg |
| ai-runtime | Local Windows demo runtime and benchmark toolkit for Whisper/Summary workflows |

`python-ai-service` is the service boundary consumed by `backend/ai-service`.
`ai-runtime` is local-only and does not register as a deployed microservice.

## Default Runtime Host

Application configuration defaults to the VM host `192.168.101.68` for shared infrastructure. Docker Compose overrides those addresses with service names such as `mysql`, `redis`, `rabbitmq`, `nacos`, and `minio`.
