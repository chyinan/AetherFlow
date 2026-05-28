# AetherFlow JMeter Performance Tests

This directory contains JMeter plans for the main AetherFlow runtime path:

1. Gateway health and status.
2. User registration, login and current-user lookup.
3. Optional file upload, download and delete through MinIO.
4. AI provider status and metrics.
5. Workflow definition creation and workflow instance start.

## Run

Start the project first:

```powershell
docker compose up -d --build
```

Run the core gateway scenario from the repository root:

```powershell
jmeter -n `
  -t performance-test/aetherflow-core-api.jmx `
  -l performance-test/results/aetherflow-core-api.jtl `
  -e -o performance-test/results/aetherflow-core-api-report `
  -Jhost=localhost `
  -Jport=8080 `
  -Jthreads=10 `
  -Jramp_up=20 `
  -Jloops=3
```

If JMeter is not on `PATH` on this machine, use:

```powershell
& 'D:\Tools\apache-jmeter-5.6.3\bin\jmeter.bat' -n `
  -t performance-test/aetherflow-core-api.jmx `
  -l performance-test/results/aetherflow-core-api.jtl `
  -e -o performance-test/results/aetherflow-core-api-report `
  -Jhost=localhost `
  -Jport=8080 `
  -Jthreads=10 `
  -Jramp_up=20 `
  -Jloops=3
```

## Useful Properties

| Property | Default | Description |
| --- | --- | --- |
| `protocol` | `http` | Gateway protocol. |
| `host` | `localhost` | Gateway host. |
| `port` | `8080` | Gateway port. |
| `threads` | `10` | Concurrent virtual users. |
| `ramp_up` | `20` | Ramp-up seconds. |
| `loops` | `3` | Iterations per virtual user. |
| `think_time_ms` | `300` | Delay between requests. |
| `test_user_prefix` | `perf_user` | Prefix for generated test users. |
| `test_password` | `PerfPass123!` | Password for generated users. |
| `skip_upload` | `false` | Set to `true` to skip file upload/download/delete. |
| `upload_file_path` | `performance-test/data/sample-upload.txt` | File used by multipart upload. |
| `ai_model` | `llama3` | Model value passed in workflow input. |
| `sample_text` | short built-in text | Text payload used by workflow input. |
| `response_timeout` | `30000` | HTTP response timeout in milliseconds. |

Example without file upload:

```powershell
jmeter -n -t performance-test/aetherflow-core-api.jmx -l performance-test/results/no-upload.jtl -Jskip_upload=true
```

## Notes

- The scenario creates new users and workflow definitions. Use a test database or clean generated `perf_user_*` data after large runs.
- The workflow start step requires the downstream task-service, RabbitMQ and related infrastructure to be healthy.
- The upload step requires MinIO to be reachable. Disable it with `-Jskip_upload=true` when testing only gateway/auth/workflow routing.
