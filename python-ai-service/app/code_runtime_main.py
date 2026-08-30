# pattern: Imperative Shell
"""独立代码运行时入口。

该入口只暴露代码执行和健康检查，不把 LLM、文件、Provider 配置等接口
带入代码沙箱容器。执行实现复用主服务中经过测试的受限子进程执行器，
而网络隔离、资源上限和只读根文件系统由 Docker Compose 进一步提供。
"""

import os

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from .main import (
    CodeExecutionRequest,
    CodeExecutionResponse,
    _require_code_execution_api_key,
    execute_code as _execute_code_endpoint,
)

app = FastAPI(title="AetherFlow Isolated Code Runtime", version="1.0.0")

try:
    _max_request_bytes = max(64 * 1024, min(8 * 1024 * 1024, int(os.getenv("CODE_RUNTIME_MAX_REQUEST_BYTES", "1048576"))))
except ValueError:
    _max_request_bytes = 1024 * 1024


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > _max_request_bytes:
                return JSONResponse(status_code=413, content={"detail": "code runtime request is too large"})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "invalid content length"})
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "code-runtime-service", "status": "UP"}


@app.post("/v1/code/execute", response_model=CodeExecutionResponse)
def execute_code(
    request: CodeExecutionRequest,
    _: None = Depends(_require_code_execution_api_key),
) -> CodeExecutionResponse:
    # 主服务端点的依赖参数不会由这里的 FastAPI 再次解析；外层依赖已完成鉴权。
    return _execute_code_endpoint(request)
