# HTTP JSON 请求节点

`HTTP_REQUEST` / `http-request` 用于同步 JSON API 调用。`URL_FETCH` 继续用于网页正文提取，两种节点相互独立。

## 配置

- `method`：GET（默认）、POST、PUT、PATCH、DELETE、HEAD
- `url`：固定 URL，优先于 `urlVariable`
- `urlVariable`：保存 URL 的变量名，默认 `requestUrl`
- `bodyJson`：合法 JSON 文本，可以是对象、数组、字符串、数字、布尔值或 null
- `bodyVariable`：将变量值序列化为 JSON；与 `bodyJson` 互斥，字符串变量不会被再次当作 JSON 解析
- GET / HEAD 不接受请求体
- `errorStrategy`：FAIL（默认，终止）或 BRANCH（按 success / error 路由）
- `outputVariable`：完整响应对象的变量名，默认 `httpResponse`

BRANCH 需要同时连接带有 `success` 和 `error` 标签的两条出边。编辑器首次连线使用 success，第二次使用 error；删除其中一条后，重新连线会补齐缺少的标签。切换策略前已有的普通出边请删除后重新连接。服务端保存与执行都要求两个分支存在，不会把缺失的错误分支回退到成功路径。

## 输出

`httpResponse` 与自定义 `outputVariable` 都包含：

- `statusCode`：HTTP 状态码；传输失败时为 0
- `body`：解析后的 JSON；空响应、JSON null 或无法解析时为 null
- `bodyText`：原始响应文本
- `ok`：2xx 且响应是合法 JSON 或为空时为 true
- `error`：成功时为空，否则为 HTTP_STATUS_ERROR、INVALID_JSON_RESPONSE 或 HTTP_REQUEST_FAILED

另提供顶层变量 `httpStatusCode`、`httpBodyText`、`httpOk`、`httpError`。非 2xx 和无法解析的响应在 BRANCH 模式下保留状态码与原文，供错误分支处理。配置错误、URL 策略拒绝和线程中断始终终止节点，不转换成可恢复成功。

## 范围与限制

- 共用 `aetherflow.workflow.ingestion.url` 的允许主机、私网、超时和字节上限配置及 URL 校验；节点不能扩大服务器网络权限
- 不跟随重定向，不接受 URL 用户信息，不提供任意请求头、凭据保存或服务器文件输入
- 请求体和响应体均受大小限制，超时覆盖完整响应读取
- 不自动轮询异步任务，不在节点内部自动重试
- 写入请求需使用接口自身的业务幂等键（可放在 JSON 中）；工作流级重试或人工重跑可能再次发送请求

## 模拟测试

HTTP 服务测试使用模拟 HttpClient 和 URL 策略；执行器测试模拟 HTTP 服务。不会访问真实接口、模型服务、用户文件或凭据。前端覆盖配置输入、JSON 校验、状态切换、映射往返以及删除后重新连线。
