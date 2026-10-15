# AetherFlow 性能与投产门禁

本目录的 JMeter 计划覆盖 Gateway 核心用户旅程：匿名网关健康、注册/登录、当前用户、可选文件治理、AI 服务可用性与本人 Provider 策略，以及工作流定义创建和实例启动。

基线工作流只使用 `START -> TEMPLATE_TRANSFORM -> END`，用于稳定测量平台本身，不依赖 GPU、Whisper、LLM 或外部图像 Provider。AI 能力是否可执行由工作流启动前能力预检单独保证。

## 三层验证

先验证阈值门禁能正确接受/拒绝固定结果：

```powershell
.\scripts\aetherflow-performance-gate-self-test.ps1
```

再用确定性 Mock Gateway 运行真实 JMeter CLI，验证 JMX、Groovy、JSON 提取、条件控制器和结果门禁：

```powershell
.\scripts\aetherflow-performance-contract-test.ps1
```

最后，在完整环境健康后运行真实基线：

```powershell
.\scripts\aetherflow-run-performance.ps1 `
  -HostName localhost `
  -Port 80 `
  -Threads 10 `
  -RampUpSeconds 20 `
  -Loops 3
```

容量门禁默认包含真实 MinIO 文件上传/下载/删除链路；只有明确使用 `-SkipUpload` 才允许跳过。脚本会先检查 `/health` 和 `/actuator/health`，为本次运行创建带时间戳的独立目录，生成 JTL、HTML 报告和 `performance-gate-summary.json`，不会覆盖历史结果。

## 默认门禁

| 指标 | 默认阈值 |
| --- | ---: |
| 总错误率 | `<= 1%` |
| HTTP P95 | `<= 2000 ms` |
| HTTP P99 | `<= 5000 ms` |
| 最小样本数 | `max(10, threads * loops * 10)` |

任何 JSR223、断言或 HTTP 失败都会计入错误率；延迟百分位只统计真实 HTTP 样本，不把测试数据准备脚本的首次 Groovy 编译耗时混入 API 延迟。

可直接对已有 JTL 执行门禁：

```powershell
.\scripts\aetherflow-performance-gate.ps1 `
  -JtlPath .\performance-test\results\run-YYYYMMDD-HHMMSS\aetherflow-core-api.jtl `
  -MaxErrorRatePercent 1 `
  -MaxP95Milliseconds 2000 `
  -MaxP99Milliseconds 5000 `
  -MinSamples 300
```

## 部署闭环

只验证 Compose 展开结果和关键服务定义：

```powershell
.\scripts\aetherflow-verify-deployment.ps1 -ConfigOnly
```

验证 Docker 守护进程、关键容器和公开健康入口，并追加双用户性能烟测：

```powershell
.\scripts\aetherflow-verify-deployment.ps1 -RunPerformanceSmoke
```

首次部署前必须先运行 `.\scripts\aetherflow-init-env.ps1`。`.env.example` 故意保留空白密钥，不能直接作为可部署环境文件。

## 常用参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `Protocol` | `http` | Gateway 协议 |
| `HostName` | `localhost` | Gateway 主机 |
| `Port` | `8080` | Gateway 端口；经 Nginx 时通常为 `80` |
| `Threads` | `10` | 并发虚拟用户 |
| `RampUpSeconds` | `20` | 加压时间 |
| `Loops` | `3` | 每个虚拟用户循环次数 |
| `SkipUpload` | `false` | 跳过 MinIO 上传/下载/删除 |
| `JMeterPath` | 自动发现 | 可显式指定 `jmeter.bat` |

该场景会创建随机测试用户和工作流定义。正式压测必须使用隔离数据库，并为 `perf_user_*` 数据设置测试后清理策略。仓库中旧的 JTL 只作为历史诊断证据，不能替代当前代码版本的新鲜门禁结果。

## 分角色契约

默认计划的注册身份为普通 `USER`，只读取 `/ai/provider/policy/user` 的本人策略，不读取平台共享指标。匿名网关请求使用 `/actuator/health`；该接口返回原生 `status` JSON，HTTP 非 2xx 仍由 JMeter 判为失败。请求数量、Result 业务错误断言及容量阈值保持不变。

`/gateway/status` 与 `/ai/provider/metrics` 仅供 `ADMIN/OWNER` 使用，不包含在普通用户容量基线。管理员指标性能验证需要独立、显式授权的管理员测试身份和独立场景；不得复用注册 USER、伪造角色或放宽网关权限。当前计划不提供管理员指标负载，也不声称验证该容量。

可先运行不访问真实服务的合成契约测试：

```powershell
node --test performance-test/mock-gateway-server.test.mjs
```

测试检查默认 JMX 路径和保留的 Result 失败断言，并直接调用合成处理器验证健康响应、本人策略鉴权及运维接口的 401/403。它不能替代真实 JMeter/Groovy、Java 网关回归或持续压测。
