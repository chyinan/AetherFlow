#!/usr/bin/env bash
set -euo pipefail

cd "${AETHERFLOW_HOME:-/opt/aetherflow}"

docker network create aetherflow-network >/dev/null 2>&1 || true

docker compose pull mysql redis rabbitmq nacos seata sentinel-dashboard elasticsearch kibana || true
docker compose build
docker compose up -d mysql redis rabbitmq nacos elasticsearch kibana
docker compose up -d seata sentinel-dashboard
docker compose up -d minio python-ai-service
docker compose up -d auth-service file-service task-service notify-service ai-service workflow-service
docker compose up -d gateway-service nginx

docker compose ps
