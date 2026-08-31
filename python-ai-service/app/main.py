# pattern: Mixed (needs refactoring)
# Reason: the existing FastAPI entrypoint still combines HTTP orchestration with runtime adapters.
import ast
import asyncio
import base64
import ipaddress
import json
import logging
import os
import secrets
import shutil
import socket
import subprocess
import signal
import math
import tempfile
import threading
import time
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("aetherflow.python-ai")

_whisper_model = None

def _bounded_slots(name: str, default: int):
    try:
        count = max(1, min(32, int(os.getenv(name, str(default)))))
    except ValueError:
        count = default
    return threading.BoundedSemaphore(count)

_whisper_slots = _bounded_slots("WHISPER_MAX_CONCURRENCY", 2)
_ffmpeg_slots = _bounded_slots("FFMPEG_MAX_CONCURRENCY", 2)
_llm_slots = _bounded_slots("LLM_MAX_CONCURRENCY", 8)

# 代码执行必须由独立运行时服务承载；并发闸门避免少量租户耗尽运行时资源。
try:
    _code_execution_max_concurrency = max(1, min(32, int(os.getenv("CODE_RUNTIME_MAX_CONCURRENCY", "2"))))
except ValueError:
    _code_execution_max_concurrency = 2
_code_execution_slots = threading.BoundedSemaphore(_code_execution_max_concurrency)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _whisper_model
    _ensure_runtime_env_loaded()
    if _enabled("ENABLE_WHISPER") and _whisper_runtime_ready():
        try:
            from faster_whisper import WhisperModel

            model_name = os.getenv("WHISPER_MODEL", "small")
            _whisper_model = WhisperModel(
                model_name,
                device=os.getenv("WHISPER_DEVICE", "cpu"),
                compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            )
            logger.info("Whisper model '%s' loaded at startup", model_name)
        except (OSError, RuntimeError, ImportError) as exc:
            logger.warning("Failed to load Whisper model at startup: %s", exc)
            _whisper_model = None
    yield
    _whisper_model = None


app = FastAPI(title="AetherFlow Python AI Service", version="0.2.0", lifespan=lifespan)


def _require_runtime_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("AI_SERVICE_API_KEY", "").strip()
    environment = os.getenv("APP_ENV", "dev").strip().lower()
    if not expected:
        if environment in {"dev", "test", "local"}:
            return
        raise HTTPException(status_code=503, detail="AI_SERVICE_API_KEY is not configured")
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid runtime api key")


def _configure_telemetry() -> None:
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "").strip()
    if not endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logging.getLogger(__name__).warning("OpenTelemetry endpoint configured but instrumentation packages are unavailable")
        return

    provider = TracerProvider(resource=Resource.create({
        "service.name": os.getenv("OTEL_SERVICE_NAME", "python-ai-service"),
    }))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    HTTPXClientInstrumentor().instrument(tracer_provider=provider)
    RequestsInstrumentor().instrument(tracer_provider=provider)


_configure_telemetry()


class TranscriptionRequest(BaseModel):
    fileUrl: str = Field(..., min_length=1, max_length=2048)
    language: Optional[str] = Field(default=None, max_length=32)
    prompt: Optional[str] = Field(default=None, max_length=8_000)


class TranscriptionResponse(BaseModel):
    text: str
    srtContent: Optional[str] = None
    srtFileName: Optional[str] = None
    durationSeconds: Optional[float] = None


class LlmRequest(BaseModel):
    provider: str = Field(default="ollama")
    model: str = Field(default="llama3")
    prompt: str = Field(..., min_length=1)
    options: dict[str, Any] = Field(default_factory=dict)
    timeoutSeconds: float = Field(default=60.0, gt=0.0, le=1800.0)


class LlmResponse(BaseModel):
    provider: str
    model: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubtitleRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1_000_000)
    format: str = Field(default="srt")
    lineSeconds: float = Field(default=3.0, ge=0.5, le=30.0)


class SubtitleResponse(BaseModel):
    content: str
    format: str


class MediaTransformRequest(BaseModel):
    fileUrl: str = Field(..., min_length=1)
    operation: str = Field(default="extract-audio")
    outputFormat: str = Field(default="wav")
    timeoutSeconds: float = Field(default=120.0, gt=0.1, le=600.0)


class MediaTransformResponse(BaseModel):
    fileName: str
    contentType: str
    contentBase64: str
    size: int
    durationSeconds: Optional[float] = None


class CodeExecutionRequest(BaseModel):
    language: str = Field(default="python3")
    code: str = Field(..., min_length=1, max_length=16_000)
    input: Any = None
    timeoutMs: int = Field(default=2_000, ge=50, le=10_000)
    maxOutputBytes: int = Field(default=64_000, ge=1_024, le=256_000)


class CodeExecutionResponse(BaseModel):
    result: Any = None
    stdout: str = ""
    durationMs: int
    truncated: bool = False


class ProviderConfigUpdate(BaseModel):
    enabled: bool = True
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None
    defaultModel: Optional[str] = None


PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "ollama": {
        "name": "Ollama",
        "providerType": "ollama",
        "envPrefix": "OLLAMA",
        "routeProvider": "ollama",
        "defaultBaseUrl": "http://127.0.0.1:11434",
        "defaultModel": "qwen3.5:9b",
        "description": "Local Ollama runtime for private chat and embedding models.",
        "tags": ["local", "private", "chat", "embedding"],
        "region": "domestic",
    },
    "openai": {
        "name": "OpenAI",
        "providerType": "openai-compatible",
        "envPrefix": "OPENAI",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.openai.com/v1",
        "defaultModel": "gpt-4o-mini",
        "description": "OpenAI hosted chat and multimodal models.",
        "tags": ["chat", "summary", "translate", "json"],
        "region": "global",
    },
    "azure-openai": {
        "name": "Azure OpenAI",
        "providerType": "openai-compatible",
        "envPrefix": "AZURE_OPENAI",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
        "defaultModel": "gpt-4o-mini",
        "description": "Azure-hosted OpenAI-compatible model endpoint.",
        "tags": ["chat", "enterprise", "azure"],
        "region": "global",
    },
    "openrouter": {
        "name": "OpenRouter",
        "providerType": "openai-compatible",
        "envPrefix": "OPENROUTER",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://openrouter.ai/api/v1",
        "defaultModel": "qwen/qwen3.5-9b",
        "description": "OpenAI-compatible gateway for multiple hosted and open models.",
        "tags": ["chat", "router", "openai-compatible"],
        "region": "global",
    },
    "anthropic": {
        "name": "Anthropic",
        "providerType": "openai-compatible",
        "envPrefix": "ANTHROPIC",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.anthropic.com/v1",
        "defaultModel": "claude-3-5-sonnet-latest",
        "description": "Anthropic Claude models through a compatible gateway.",
        "tags": ["chat", "reasoning", "global"],
        "region": "global",
    },
    "gemini": {
        "name": "Gemini",
        "providerType": "openai-compatible",
        "envPrefix": "GEMINI",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
        "defaultModel": "gemini-2.0-flash",
        "description": "Google Gemini models through an OpenAI-compatible endpoint.",
        "tags": ["chat", "vision", "global"],
        "region": "global",
    },
    "deepseek": {
        "name": "DeepSeek",
        "providerType": "openai-compatible",
        "envPrefix": "DEEPSEEK",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.deepseek.com/v1",
        "defaultModel": "deepseek-chat",
        "description": "DeepSeek chat and reasoning models.",
        "tags": ["chat", "reasoning", "domestic"],
        "region": "domestic",
    },
    "qwen": {
        "name": "Qwen",
        "providerType": "openai-compatible",
        "envPrefix": "QWEN",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "defaultModel": "qwen-plus",
        "description": "Alibaba Cloud Qwen models through compatible-mode API.",
        "tags": ["chat", "domestic", "multilingual"],
        "region": "domestic",
    },
    "kimi": {
        "name": "Kimi",
        "providerType": "openai-compatible",
        "envPrefix": "KIMI",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.moonshot.cn/v1",
        "defaultModel": "moonshot-v1-8k",
        "description": "Moonshot Kimi long-context chat models.",
        "tags": ["chat", "long-context", "domestic"],
        "region": "domestic",
    },
    "volcengine": {
        "name": "Volcengine Ark",
        "providerType": "openai-compatible",
        "envPrefix": "VOLCENGINE",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
        "defaultModel": "doubao-1-5-pro-32k",
        "description": "Volcengine Ark OpenAI-compatible model endpoint.",
        "tags": ["chat", "domestic", "ark"],
        "region": "domestic",
    },
    "tencent-hunyuan": {
        "name": "Tencent Hunyuan",
        "providerType": "openai-compatible",
        "envPrefix": "TENCENT_HUNYUAN",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.hunyuan.cloud.tencent.com/v1",
        "defaultModel": "hunyuan-standard",
        "description": "Tencent Hunyuan model endpoint.",
        "tags": ["chat", "domestic"],
        "region": "domestic",
    },
    "jina": {
        "name": "Jina",
        "providerType": "embedding",
        "envPrefix": "JINA",
        "routeProvider": "openai",
        "defaultBaseUrl": "https://api.jina.ai/v1",
        "defaultModel": "jina-embeddings-v3",
        "description": "Embedding and rerank model provider.",
        "tags": ["embedding", "rerank"],
        "region": "global",
    },
    "text-embedding": {
        "name": "Text Embedding Inference",
        "providerType": "embedding",
        "envPrefix": "TEXT_EMBEDDING",
        "routeProvider": "openai",
        "defaultBaseUrl": "http://localhost:8081/v1",
        "defaultModel": "bge-m3",
        "description": "Self-hosted embedding endpoint for knowledge retrieval.",
        "tags": ["embedding", "self-hosted"],
        "region": "domestic",
    },
}

_RUNTIME_ENV_LOADED = False


def _is_dev_env() -> bool:
    return os.getenv("APP_ENV", "").lower() == "dev" or os.getenv("AI_SERVICE_DEV", "false").lower() == "true"


def sanitize_error_message(exc: Exception) -> str:
    """Return a client-safe error message for an exception.

    ``str(exc)`` frequently contains absolute filesystem paths, environment
    variable names, hostnames, or upstream configuration details (e.g. an
    httpx error embedding ``http://127.0.0.1:11434``, a file open error
    echoing the full temp dir, etc.). Relaying that to the client gives an
    attacker useful internal intelligence, so in production we always return
    a generic message and rely on the server-side log (written by the global
    handler via ``logger.exception``) for diagnostics. In dev/test we keep
    the raw text to aid debugging.
    """
    if _is_dev_env():
        return str(exc)
    return "internal error"


def _require_admin_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    """Protect provider config endpoints. In non-dev environments a valid X-API-Key is required."""
    if _is_dev_env():
        return
    expected = os.getenv("AI_SERVICE_API_KEY", "").strip()
    if not expected:
        # Fail closed: never expose/mutate secrets without an admin key configured in prod.
        raise HTTPException(status_code=503, detail="admin API key is not configured")
    if not x_api_key or x_api_key.strip() != expected:
        raise HTTPException(status_code=401, detail="missing or invalid X-API-Key")


def _require_code_execution_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    """Keep the arbitrary-code endpoint private even on the container network."""
    if _is_dev_env():
        return
    if os.getenv("ENABLE_CODE_RUNTIME_ENDPOINT", "false").strip().lower() != "true":
        raise HTTPException(status_code=404, detail="code runtime endpoint is not enabled on this service")
    expected = os.getenv("CODE_RUNTIME_API_KEY", "").strip()
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="code runtime API key is not configured")
    if not x_api_key or not secrets.compare_digest(x_api_key.strip(), expected):
        raise HTTPException(status_code=401, detail="missing or invalid code runtime API key")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled python ai runtime error path=%s", request.url.path)
    if _is_dev_env():
        # Dev/test: surface the raw exception text and request path so the
        # caller can debug without inspecting server logs.
        content = {"code": 500, "message": sanitize_error_message(exc), "path": request.url.path}
    else:
        # Production: never relay str(exc) (it may leak internal paths, env
        # var names, hostnames, or upstream URLs) and do not echo the request
        # path either. The full diagnostic is preserved in the server log.
        content = {"code": 500, "message": sanitize_error_message(exc)}
    return JSONResponse(status_code=500, content=content)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"service": "python-ai-service", "status": "UP"}


@app.get("/ai/status")
def ai_status() -> dict[str, Any]:
    _ensure_runtime_env_loaded()
    whisper_enabled = _enabled("ENABLE_WHISPER")
    ollama_models = _ollama_model_names()
    providers = _status_providers()
    openai_models = _openai_model_names()
    models = {
        "ollama": ollama_models,
    }
    if openai_models:
        models["openai"] = openai_models
    return {
        "service": "python-ai-service",
        "status": "UP",
        "capabilities": ["whisper", "ffmpeg", "subtitle", "llm"],
        "providers": providers,
        "models": models,
        "whisperEnabled": whisper_enabled,
        "whisperRuntimeReady": _whisper_runtime_ready() if whisper_enabled else False,
        "whisperModel": os.getenv("WHISPER_MODEL", "small"),
        "llmEnabled": _enabled("ENABLE_LLM"),
        "ffmpegAvailable": shutil.which("ffmpeg") is not None,
    }


@app.get("/ai/provider/config")
def provider_config_catalog(_: None = Depends(_require_admin_api_key)) -> dict[str, Any]:
    _ensure_runtime_env_loaded()
    return {"providers": [_provider_config_entry(provider_id) for provider_id in PROVIDER_PRESETS]}


@app.put("/ai/provider/config/{provider_id}")
def update_provider_config(provider_id: str, update: ProviderConfigUpdate, _: None = Depends(_require_admin_api_key)) -> dict[str, Any]:
    _ensure_runtime_env_loaded()
    normalized_id = provider_id.strip().lower()
    if normalized_id not in PROVIDER_PRESETS:
        raise HTTPException(status_code=404, detail=f"unknown provider preset: {provider_id}")
    _apply_provider_config(normalized_id, update)
    _persist_runtime_env()
    return _provider_config_entry(normalized_id)


@app.post("/v1/transcriptions", response_model=TranscriptionResponse, dependencies=[Depends(_require_runtime_api_key)])
async def transcribe(request: TranscriptionRequest) -> TranscriptionResponse:
    logger.info("ASR request fileUrl=%s language=%s", request.fileUrl, request.language)
    if not _enabled("ENABLE_WHISPER"):
        raise HTTPException(status_code=503, detail="Whisper service disabled. Set ENABLE_WHISPER=true to enable.")

    if _whisper_model is None:
        raise HTTPException(status_code=503, detail="whisper model is not loaded")
    if not _whisper_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="whisper runtime is busy; retry later")
    try:
        source = _materialize_source(request.fileUrl)
        audio_source = _ensure_audio_source(source)
    except Exception:
        _whisper_slots.release()
        raise
    cleaned = False

    def cleanup(_task=None):
        nonlocal cleaned
        if not cleaned:
            cleaned = True
            _cleanup_materialized(source, audio_source)
            _whisper_slots.release()

    task = asyncio.create_task(asyncio.to_thread(_transcribe_blocking, request, audio_source))
    try:
        timeout = max(1.0, min(3600.0, float(os.getenv("WHISPER_TIMEOUT_SECONDS", "1800"))))
        return await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
    except TimeoutError as exc:
        task.add_done_callback(cleanup)
        raise HTTPException(status_code=504, detail="whisper transcription deadline exceeded") from exc
    except asyncio.CancelledError:
        task.add_done_callback(cleanup)
        raise
    finally:
        if task.done():
            cleanup()


def _transcribe_blocking(request: TranscriptionRequest, audio_source: Path) -> TranscriptionResponse:
    segments, info = _whisper_model.transcribe(
        str(audio_source),
        language=None if request.language in (None, "", "auto") else request.language,
        initial_prompt=request.prompt,
    )
    srt_content = _segments_to_srt(segments)
    text = "\n".join(line for line in srt_content.splitlines() if "-->" not in line and not line.isdigit()).strip()
    return TranscriptionResponse(
        text=text,
        srtContent=srt_content,
        srtFileName="transcription.srt",
        durationSeconds=info.duration,
    )


@app.post("/v1/llm/chat", response_model=LlmResponse, dependencies=[Depends(_require_runtime_api_key)])
async def llm_chat(request: LlmRequest) -> LlmResponse:
    provider = request.provider.lower().strip()
    logger.info("LLM request provider=%s model=%s", provider, request.model)
    if not _enabled("ENABLE_LLM"):
        raise HTTPException(status_code=503, detail="LLM service disabled. Set ENABLE_LLM=true to enable.")
    if not _llm_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="llm runtime is busy; retry later")
    timeout = _effective_timeout_seconds(request)
    try:
        async with asyncio.timeout(timeout):
            if provider == "openai":
                return await _call_openai_async(request)
            if provider == "ollama":
                return await _call_ollama_async(request)
            raise HTTPException(status_code=400, detail=f"unsupported llm provider: {request.provider}")
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="LLM provider deadline exceeded") from exc
    finally:
        _llm_slots.release()


@app.post("/v1/llm/chat/stream", dependencies=[Depends(_require_runtime_api_key)])
def llm_chat_stream(request: LlmRequest, http_request: Request) -> StreamingResponse:
    provider = request.provider.lower().strip()
    logger.info("LLM stream request provider=%s model=%s", provider, request.model)
    if not _enabled("ENABLE_LLM"):
        raise HTTPException(status_code=503, detail="LLM service disabled. Set ENABLE_LLM=true to enable.")
    if provider not in {"openai", "ollama"}:
        raise HTTPException(status_code=400, detail=f"unsupported llm provider: {request.provider}")
    if not _llm_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="llm runtime is busy; retry later")

    async def events():
        deadline = asyncio.get_running_loop().time() + _effective_timeout_seconds(request)
        chunks = _stream_openai_async(request) if provider == "openai" else _stream_ollama_async(request)
        iterator = chunks.__aiter__()
        try:
            while True:
                if await http_request.is_disconnected():
                    break
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    break
                try:
                    chunk = await asyncio.wait_for(iterator.__anext__(), timeout=remaining)
                except StopAsyncIteration:
                    break
                except TimeoutError:
                    break
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            if not await http_request.is_disconnected():
                yield "data: [DONE]\n\n"
        finally:
            close = getattr(iterator, "aclose", None)
            if close is not None:
                await close()
            _llm_slots.release()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/v1/subtitles", response_model=SubtitleResponse, dependencies=[Depends(_require_runtime_api_key)])
def subtitles(request: SubtitleRequest) -> SubtitleResponse:
    fmt = request.format.lower().strip()
    if fmt not in {"srt", "vtt"}:
        raise HTTPException(status_code=400, detail="subtitle format must be srt or vtt")
    content = _text_to_subtitle(request.text, fmt, request.lineSeconds)
    return SubtitleResponse(content=content, format=fmt)


@app.post("/v1/media/ffmpeg", response_model=MediaTransformResponse, dependencies=[Depends(_require_runtime_api_key)])
def ffmpeg_transform(request: MediaTransformRequest) -> MediaTransformResponse:
    operation = request.operation.strip().lower()
    output_format = request.outputFormat.strip().lower()
    supported_formats = {"wav", "mp3", "m4a", "aac", "mp4"}
    if operation not in {"extract-audio", "convert"}:
        raise HTTPException(status_code=400, detail="media operation must be extract-audio or convert")
    if output_format not in supported_formats:
        raise HTTPException(status_code=400, detail="unsupported media output format")
    if shutil.which("ffmpeg") is None:
        raise HTTPException(status_code=503, detail="ffmpeg is not installed")
    if not _ffmpeg_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="ffmpeg runtime is busy; retry later")

    try:
        source = _materialize_source(request.fileUrl)
    except Exception:
        _ffmpeg_slots.release()
        raise
    output = Path(tempfile.gettempdir()) / f"aetherflow-media-{uuid.uuid4().hex}.{output_format}"
    try:
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
        if operation == "extract-audio":
            command.extend(["-vn", "-ac", "1", "-ar", "16000"])
        command.extend(["-f", output_format, str(output)])
        try:
            subprocess.run(command, check=True, capture_output=True, timeout=request.timeoutSeconds)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="ffmpeg transform deadline exceeded") from exc
        except subprocess.CalledProcessError as exc:
            raise HTTPException(status_code=502, detail="ffmpeg transform failed") from exc
        max_bytes = 50 * 1024 * 1024
        size = output.stat().st_size
        if size <= 0 or size > max_bytes:
            raise HTTPException(status_code=413, detail="transformed media exceeds 50 MiB limit")
        content_type = {
            "wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4",
            "aac": "audio/aac", "mp4": "video/mp4",
        }[output_format]
        return MediaTransformResponse(
            fileName=f"transformed.{output_format}",
            contentType=content_type,
            contentBase64=base64.b64encode(output.read_bytes()).decode("ascii"),
            size=size,
        )
    finally:
        output.unlink(missing_ok=True)
        _cleanup_materialized(source, source)
        _ffmpeg_slots.release()


@app.post("/v1/code/execute", response_model=CodeExecutionResponse)
def execute_code(request: CodeExecutionRequest, _: None = Depends(_require_code_execution_api_key)) -> CodeExecutionResponse:
    if not _code_execution_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="code runtime is busy; retry later")
    try:
        return _execute_code(request)
    finally:
        _code_execution_slots.release()


def _execute_code(request: CodeExecutionRequest) -> CodeExecutionResponse:
    language = request.language.strip().lower()
    if language not in {"python", "python3"}:
        raise HTTPException(status_code=400, detail="only python3 code execution is supported")
    _validate_code(request.code)
    started = time.monotonic()
    encoded_code = base64.b64encode(request.code.encode("utf-8")).decode("ascii")
    encoded_input = base64.b64encode(json.dumps(request.input, ensure_ascii=False).encode("utf-8")).decode("ascii")
    runner = _code_runner_source(encoded_code, encoded_input, request.maxOutputBytes)
    try:
        runner_environment = {
            key: os.getenv(key, "")
            for key in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "PYTHONIOENCODING")
            if os.getenv(key, "")
        }
        runner_environment["PYTHONNOUSERSITE"] = "1"
        completed = _run_code_process(
            [os.sys.executable, "-I", "-S", "-c", runner],
            cwd=tempfile.gettempdir(),
            env=runner_environment,
            timeout_seconds=request.timeoutMs / 1000,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=408, detail="code execution timed out") from exc
    duration_ms = round((time.monotonic() - started) * 1000)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "code execution failed").strip()
        raise HTTPException(status_code=400, detail=detail[-2_000:])
    marker = "__AETHERFLOW_RESULT__"
    result_line = next((line for line in reversed(completed.stdout.splitlines()) if line.startswith(marker)), None)
    if result_line is None:
        raise HTTPException(status_code=400, detail="code must define main(payload) and return a JSON value")
    try:
        encoded_result = json.loads(result_line[len(marker):])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="code result must be JSON serializable") from exc
    if not isinstance(encoded_result, dict) or "__aetherflow_result__" not in encoded_result:
        raise HTTPException(status_code=400, detail="code result envelope is invalid")
    result = encoded_result["__aetherflow_result__"]
    stdout = completed.stdout.replace(result_line, "").strip()
    encoded_stdout = stdout.encode("utf-8")
    truncated = bool(encoded_result.get("__aetherflow_stdout_truncated", False)) or len(encoded_stdout) > request.maxOutputBytes
    if truncated:
        stdout = encoded_stdout[:request.maxOutputBytes].decode("utf-8", errors="ignore")
    return CodeExecutionResponse(result=result, stdout=stdout, durationMs=duration_ms, truncated=truncated)


def _run_code_process(command: list[str], *, cwd: str, env: dict[str, str], timeout_seconds: float) -> subprocess.CompletedProcess[str]:
    """Run user code in a killable process group and never leak timed-out workers."""
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
        env=env,
        start_new_session=(os.name != "nt"),
        creationflags=(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0),
        preexec_fn=(lambda: _set_code_resource_limits(timeout_seconds)) if os.name != "nt" else None,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            # Windows 的 process.kill() 不会递归终止子进程，必须同时结束整个进程树。
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if process.poll() is None:
                process.kill()
        process.wait(timeout=2)
        raise subprocess.TimeoutExpired(command, timeout_seconds, output=exc.output, stderr=exc.stderr) from exc
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def _set_code_resource_limits(timeout_seconds: float) -> None:
    """Apply OS-level CPU/address-space limits before entering the untrusted runner."""
    try:
        import resource

        cpu_seconds = max(1, math.ceil(timeout_seconds) + 1)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        memory_bytes = 256 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
    except (ImportError, OSError, ValueError):
        # Windows and restricted containers may not expose resource(7). The
        # process-group kill/timeout guard remains active in those environments.
        return


def _validate_code(code: str) -> None:
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"invalid python syntax: {exc.msg}") from exc
    forbidden_names = {"eval", "exec", "open", "compile", "__import__", "input", "globals", "locals", "vars"}
    forbidden_modules = {"os", "sys", "subprocess", "socket", "pathlib", "shutil", "requests", "httpx"}
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise HTTPException(status_code=400, detail="imports are not allowed in code nodes")
        if isinstance(node, ast.Name) and (node.id in forbidden_names or node.id.startswith("__")):
            raise HTTPException(status_code=400, detail=f"name is not allowed: {node.id}")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise HTTPException(status_code=400, detail="dunder attributes are not allowed")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in forbidden_modules:
            raise HTTPException(status_code=400, detail=f"call is not allowed: {node.func.id}")
    if not any(isinstance(node, ast.FunctionDef) and node.name == "main" for node in tree.body):
        raise HTTPException(status_code=400, detail="code must define main(payload)")


def _code_runner_source(encoded_code: str, encoded_input: str, max_output_bytes: int) -> str:
    return f'''import base64, json, sys
class LimitedWriter:
    def __init__(self, stream, limit): self.stream, self.limit, self.used = stream, limit, 0
    def write(self, value):
        data = str(value).encode("utf-8")
        remaining = max(0, self.limit - self.used)
        if remaining: self.stream.buffer.write(data[:remaining]); self.stream.flush()
        self.used += len(data)
        return len(value)
    def flush(self): self.stream.flush()
safe_builtins = {{"abs": abs, "all": all, "any": any, "bool": bool, "dict": dict, "enumerate": enumerate,
    "float": float, "int": int, "len": len, "list": list, "max": max, "min": min, "range": range,
    "round": round, "set": set, "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "zip": zip,
    "True": True, "False": False, "None": None, "print": print}}
sys.stdout = LimitedWriter(sys.stdout, {max_output_bytes})
payload = json.loads(base64.b64decode("{encoded_input}"))
namespace = {{"__builtins__": safe_builtins}}
exec(compile(base64.b64decode("{encoded_code}").decode("utf-8"), "<aetherflow-code>", "exec"), namespace, namespace)
if "main" not in namespace or not callable(namespace["main"]): raise ValueError("main(payload) is required")
result = namespace["main"](payload)
result_envelope = {{
    "__aetherflow_result__": result,
    "__aetherflow_stdout_truncated": sys.stdout.used > {max_output_bytes},
}}
encoded_result = json.dumps(result_envelope, ensure_ascii=False, default=str)
if len(encoded_result.encode("utf-8")) > {max_output_bytes}:
    raise ValueError("code result exceeds output limit")
sys.__stdout__.write("\\n__AETHERFLOW_RESULT__" + encoded_result + "\\n")
'''


def _call_openai(request: LlmRequest) -> LlmResponse:
    _ensure_runtime_env_loaded()
    route_provider = _openai_route_provider_id()
    route_prefix = PROVIDER_PRESETS[route_provider]["envPrefix"] if route_provider else "OPENAI"
    api_key = os.getenv(f"{route_prefix}_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI-compatible provider API key is not configured")
    from openai import OpenAI

    base_url = (_provider_base_url(route_provider) if route_provider else os.getenv("OPENAI_BASE_URL", "")).strip() or None
    client = OpenAI(api_key=api_key, base_url=base_url,
                    timeout=_effective_timeout_seconds(request), max_retries=0)
    completion = client.chat.completions.create(
        model=request.model,
        messages=[{"role": "user", "content": request.prompt}],
        temperature=float(request.options.get("temperature", 0.2)),
    )
    text = completion.choices[0].message.content or ""
    metadata = {"finishReason": completion.choices[0].finish_reason}
    metadata.update(_openai_usage_metadata(completion))
    return LlmResponse(provider="openai", model=request.model, text=text, metadata=metadata)


async def _call_openai_async(request: LlmRequest) -> LlmResponse:
    _ensure_runtime_env_loaded()
    route_provider = _openai_route_provider_id()
    route_prefix = PROVIDER_PRESETS[route_provider]["envPrefix"] if route_provider else "OPENAI"
    api_key = os.getenv(f"{route_prefix}_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI-compatible provider API key is not configured")
    from openai import AsyncOpenAI

    base_url = (_provider_base_url(route_provider) if route_provider else os.getenv("OPENAI_BASE_URL", "")).strip() or None
    client = AsyncOpenAI(api_key=api_key, base_url=base_url,
                         timeout=_effective_timeout_seconds(request), max_retries=0)
    try:
        completion = await client.chat.completions.create(
            model=request.model,
            messages=[{"role": "user", "content": request.prompt}],
            temperature=float(request.options.get("temperature", 0.2)),
        )
        text = completion.choices[0].message.content or ""
        metadata = {"finishReason": completion.choices[0].finish_reason}
        metadata.update(_openai_usage_metadata(completion))
        return LlmResponse(provider="openai", model=request.model, text=text, metadata=metadata)
    finally:
        await client.close()


def _call_ollama(request: LlmRequest) -> LlmResponse:
    _ensure_runtime_env_loaded()

    client = _ollama_client(_effective_timeout_seconds(request))
    response = client.generate(
        model=request.model,
        prompt=request.prompt,
        options=request.options,
    )
    metadata = {"done": response.get("done", False)}
    metadata.update(_ollama_usage_metadata(response))
    return LlmResponse(provider="ollama", model=request.model, text=response.get("response", ""), metadata=metadata)


async def _call_ollama_async(request: LlmRequest) -> LlmResponse:
    _ensure_runtime_env_loaded()
    import ollama

    client_type = getattr(ollama, "AsyncClient", None)
    if client_type is None:
        raise HTTPException(status_code=503, detail="Ollama async runtime dependency is unavailable")
    client = client_type(
        host=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        trust_env=False,
        timeout=_effective_timeout_seconds(request),
    )
    try:
        response = await client.generate(model=request.model, prompt=request.prompt, options=request.options)
        metadata = {"done": response.get("done", False)}
        metadata.update(_ollama_usage_metadata(response))
        return LlmResponse(provider="ollama", model=request.model,
                           text=response.get("response", ""), metadata=metadata)
    finally:
        close = getattr(client, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result


def _stream_openai(request: LlmRequest):
    _ensure_runtime_env_loaded()
    route_provider = _openai_route_provider_id()
    route_prefix = PROVIDER_PRESETS[route_provider]["envPrefix"] if route_provider else "OPENAI"
    api_key = os.getenv(f"{route_prefix}_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI-compatible provider API key is not configured")
    from openai import OpenAI

    base_url = (_provider_base_url(route_provider) if route_provider else os.getenv("OPENAI_BASE_URL", "")).strip() or None
    client = OpenAI(api_key=api_key, base_url=base_url,
                    timeout=_effective_timeout_seconds(request), max_retries=0)
    completion = client.chat.completions.create(
        model=request.model,
        messages=[{"role": "user", "content": request.prompt}],
        temperature=float(request.options.get("temperature", 0.2)),
        stream=True,
    )
    for chunk in completion:
        choices = getattr(chunk, "choices", None) or []
        if not choices:
            continue
        delta = getattr(choices[0], "delta", None)
        text = getattr(delta, "content", None) if delta is not None else None
        if text:
            yield {"provider": "openai", "model": request.model, "text": text, "metadata": {}}


def _stream_ollama(request: LlmRequest):
    _ensure_runtime_env_loaded()
    client = _ollama_client(_effective_timeout_seconds(request))
    for chunk in client.generate(model=request.model, prompt=request.prompt, options=request.options, stream=True):
        text = chunk.get("response", "") if isinstance(chunk, dict) else ""
        if text:
            yield {"provider": "ollama", "model": request.model, "text": text, "metadata": {}}


async def _stream_openai_async(request: LlmRequest):
    _ensure_runtime_env_loaded()
    route_provider = _openai_route_provider_id()
    route_prefix = PROVIDER_PRESETS[route_provider]["envPrefix"] if route_provider else "OPENAI"
    api_key = os.getenv(f"{route_prefix}_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI-compatible provider API key is not configured")
    from openai import AsyncOpenAI

    base_url = (_provider_base_url(route_provider) if route_provider else os.getenv("OPENAI_BASE_URL", "")).strip() or None
    client = AsyncOpenAI(api_key=api_key, base_url=base_url,
                         timeout=_effective_timeout_seconds(request), max_retries=0)
    stream = None
    try:
        stream = await client.chat.completions.create(
            model=request.model,
            messages=[{"role": "user", "content": request.prompt}],
            temperature=float(request.options.get("temperature", 0.2)),
            stream=True,
        )
        async for chunk in stream:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            text = getattr(delta, "content", None) if delta is not None else None
            if text:
                yield {"provider": "openai", "model": request.model, "text": text, "metadata": {}}
    finally:
        close_stream = getattr(stream, "aclose", None) or getattr(stream, "close", None)
        if close_stream is not None:
            result = close_stream()
            if hasattr(result, "__await__"):
                await result
        await client.close()


async def _stream_ollama_async(request: LlmRequest):
    _ensure_runtime_env_loaded()
    import ollama

    client_type = getattr(ollama, "AsyncClient", None)
    if client_type is None:
        raise HTTPException(status_code=503, detail="Ollama async runtime dependency is unavailable")
    client = client_type(
        host=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        trust_env=False,
        timeout=_effective_timeout_seconds(request),
    )
    stream = None
    try:
        stream = await client.generate(model=request.model, prompt=request.prompt,
                                       options=request.options, stream=True)
        async for chunk in stream:
            text = chunk.get("response", "") if isinstance(chunk, dict) else ""
            if text:
                yield {"provider": "ollama", "model": request.model, "text": text, "metadata": {}}
    finally:
        close_stream = getattr(stream, "aclose", None)
        if close_stream is not None:
            await close_stream()
        close = getattr(client, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result


def _openai_usage_metadata(completion: Any) -> dict[str, int]:
    usage = getattr(completion, "usage", None)
    if usage is None:
        return {}
    values = {
        "promptTokens": getattr(usage, "prompt_tokens", None),
        "completionTokens": getattr(usage, "completion_tokens", None),
        "totalTokens": getattr(usage, "total_tokens", None),
    }
    return {key: int(value) for key, value in values.items() if isinstance(value, int) and value >= 0}


def _ollama_usage_metadata(response: dict[str, Any]) -> dict[str, int]:
    prompt_tokens = response.get("prompt_eval_count")
    completion_tokens = response.get("eval_count")
    metadata: dict[str, int] = {}
    if isinstance(prompt_tokens, int) and prompt_tokens >= 0:
        metadata["promptTokens"] = prompt_tokens
    if isinstance(completion_tokens, int) and completion_tokens >= 0:
        metadata["completionTokens"] = completion_tokens
    if "promptTokens" in metadata and "completionTokens" in metadata:
        metadata["totalTokens"] = metadata["promptTokens"] + metadata["completionTokens"]
    return metadata


def _ollama_model_names() -> list[str]:
    try:
        client = _ollama_client()
        response = client.list()
        models = response.get("models", []) if isinstance(response, dict) else getattr(response, "models", [])
        names: list[str] = []
        for model in models:
            name = _ollama_model_name(model)
            if name and name not in names:
                names.append(name)
        return names
    except ImportError as exc:
        logger.warning("Ollama runtime dependency unavailable: %s", exc)
        return []
    except (httpx.HTTPError, ConnectionError, TimeoutError, OSError) as exc:
        logger.warning("Failed to list Ollama models: %s", exc)
        return []


def _effective_timeout_seconds(request: Any) -> float:
    requested = float(getattr(request, "timeoutSeconds", 60.0))
    configured = float(os.getenv("AI_PROVIDER_MAX_TIMEOUT_SECONDS", "1800"))
    return max(0.1, min(requested, configured, 1800.0))


def _ollama_client(timeout_seconds: Optional[float] = None):
    import ollama

    options: dict[str, Any] = {
        "host": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "trust_env": False,
    }
    if timeout_seconds is not None:
        options["timeout"] = timeout_seconds
    return ollama.Client(**options)


def _ollama_model_name(model: Any) -> str:
    if isinstance(model, dict):
        return str(model.get("name") or model.get("model") or "").strip()
    return str(getattr(model, "name", None) or getattr(model, "model", None) or "").strip()


def _runtime_config_file() -> Optional[Path]:
    configured = os.getenv("AI_RUNTIME_CONFIG_FILE", "").strip()
    if configured.lower() in {"", "none", "false"}:
        return Path(__file__).resolve().parents[1] / ".env.runtime"
    return Path(configured)


def _ensure_runtime_env_loaded() -> None:
    global _RUNTIME_ENV_LOADED
    if _RUNTIME_ENV_LOADED:
        return
    config_file = _runtime_config_file()
    if config_file and config_file.exists():
        for line in config_file.read_text(encoding="utf-8").splitlines():
            key, value = _parse_env_line(line)
            if key:
                os.environ.setdefault(key, value)
    _RUNTIME_ENV_LOADED = True


def _parse_env_line(line: str) -> tuple[str, str]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return "", ""
    key, value = stripped.split("=", 1)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return key.strip(), value


def _provider_config_entry(provider_id: str) -> dict[str, Any]:
    preset = PROVIDER_PRESETS[provider_id]
    prefix = preset["envPrefix"]
    api_key = os.getenv(f"{prefix}_API_KEY", "")
    if provider_id == "openai" and _active_openai_preset() not in {"", "openai"}:
        api_key = ""
    enabled = _provider_enabled(provider_id)
    base_url = _provider_base_url(provider_id)
    default_model = _provider_default_model(provider_id)
    return {
        "id": provider_id,
        "name": preset["name"],
        "providerType": preset["providerType"],
        "baseUrl": base_url,
        "defaultModel": default_model,
        "configured": _provider_configured(provider_id),
        "enabled": enabled,
        "apiKeyConfigured": bool(api_key.strip()) if preset["routeProvider"] != "ollama" else True,
        "apiKeyPreview": _mask_secret(api_key),
        "tags": preset["tags"],
        "description": preset["description"],
        "region": preset["region"],
    }


def _provider_enabled(provider_id: str) -> bool:
    preset = PROVIDER_PRESETS[provider_id]
    prefix = preset["envPrefix"]
    if provider_id == "openai" and _active_openai_preset() not in {"", "openai"}:
        return False
    value = os.getenv(f"{prefix}_ENABLED", "")
    if value.strip():
        return value.strip().lower() == "true"
    return preset["routeProvider"] == "ollama" or bool(os.getenv(f"{prefix}_API_KEY", "").strip())


def _provider_configured(provider_id: str) -> bool:
    preset = PROVIDER_PRESETS[provider_id]
    prefix = preset["envPrefix"]
    if provider_id == "openai" and _active_openai_preset() not in {"", "openai"}:
        return False
    if preset["routeProvider"] == "ollama":
        return bool(_provider_base_url(provider_id))
    return _provider_enabled(provider_id) and bool(os.getenv(f"{prefix}_API_KEY", "").strip())


def _provider_base_url(provider_id: str) -> str:
    preset = PROVIDER_PRESETS[provider_id]
    return os.getenv(f"{preset['envPrefix']}_BASE_URL", "").strip() or preset["defaultBaseUrl"]


def _provider_default_model(provider_id: str) -> str:
    preset = PROVIDER_PRESETS[provider_id]
    return os.getenv(f"{preset['envPrefix']}_DEFAULT_MODEL", "").strip() or preset["defaultModel"]


def _apply_provider_config(provider_id: str, update: ProviderConfigUpdate) -> None:
    preset = PROVIDER_PRESETS[provider_id]
    prefix = preset["envPrefix"]
    os.environ[f"{prefix}_ENABLED"] = "true" if update.enabled else "false"
    if update.apiKey is not None:
        _set_or_clear_env(f"{prefix}_API_KEY", update.apiKey.strip())
    if update.baseUrl is not None:
        _set_or_clear_env(f"{prefix}_BASE_URL", update.baseUrl.strip() or preset["defaultBaseUrl"])
    if update.defaultModel is not None:
        _set_or_clear_env(f"{prefix}_DEFAULT_MODEL", update.defaultModel.strip() or preset["defaultModel"])

    if preset["routeProvider"] == "openai" and update.enabled:
        api_key = os.getenv(f"{prefix}_API_KEY", "").strip()
        if api_key:
            os.environ["OPENAI_ACTIVE_PRESET"] = provider_id
    if preset["routeProvider"] == "openai" and not update.enabled and _active_openai_preset() == provider_id:
        os.environ.pop("OPENAI_ACTIVE_PRESET", None)
    if preset["routeProvider"] == "ollama":
        os.environ["OLLAMA_BASE_URL"] = _provider_base_url(provider_id)
        os.environ["OLLAMA_DEFAULT_MODEL"] = _provider_default_model(provider_id)


def _set_or_clear_env(key: str, value: str) -> None:
    if value:
        os.environ[key] = value
    else:
        os.environ.pop(key, None)


def _persist_runtime_env() -> None:
    config_file = _runtime_config_file()
    if config_file is None:
        return
    keys = _runtime_env_keys()
    lines = [f"{key}={_quote_env_value(os.getenv(key, ''))}" for key in keys if key in os.environ]
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def _runtime_env_keys() -> list[str]:
    keys = ["OPENAI_ACTIVE_PRESET", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_DEFAULT_MODEL", "OLLAMA_BASE_URL", "OLLAMA_DEFAULT_MODEL"]
    for preset in PROVIDER_PRESETS.values():
        prefix = preset["envPrefix"]
        keys.extend([f"{prefix}_ENABLED", f"{prefix}_API_KEY", f"{prefix}_BASE_URL", f"{prefix}_DEFAULT_MODEL"])
    return sorted(dict.fromkeys(keys))


def _quote_env_value(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••"
    return f"{value[:3]}-••••••{value[-3:]}"


def _status_providers() -> list[str]:
    providers = ["ollama"]
    if _openai_model_names():
        providers.insert(0, "openai")
    return providers


def _active_openai_preset() -> str:
    return os.getenv("OPENAI_ACTIVE_PRESET", "").strip().lower()


def _openai_route_provider_id() -> str:
    active_preset = _active_openai_preset()
    if active_preset in PROVIDER_PRESETS and _provider_configured(active_preset):
        return active_preset
    if _provider_configured("openai"):
        return "openai"
    for provider_id, preset in PROVIDER_PRESETS.items():
        if preset["routeProvider"] == "openai" and provider_id != "openai" and _provider_configured(provider_id):
            return provider_id
    return ""


def _openai_model_names() -> list[str]:
    route_provider = _openai_route_provider_id()
    if not route_provider:
        return []
    return [_provider_default_model(route_provider)]


def is_internal_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return True
    hostname = parsed.hostname
    if not hostname:
        return True
    if hostname in ("localhost", "localhost."):
        return True
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    except ValueError:
        pass
    try:
        resolved = socket.getaddrinfo(hostname, None)
        for _family, _type, _proto, _canon, addr in resolved:
            ip = ipaddress.ip_address(addr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return True
    except (socket.gaierror, OSError):
        pass
    return False


def _materialize_source(file_url: str) -> Path:
    if file_url.startswith("http://") or file_url.startswith("https://"):
        download_url = _rewrite_file_url(file_url)
        rewritten = download_url != file_url
        if not rewritten and is_internal_url(download_url):
            raise HTTPException(status_code=400, detail="access to internal/private URLs is not allowed")
        parsed_download_url = urllib.parse.urlparse(download_url)
        if parsed_download_url.scheme not in ("http", "https") or not parsed_download_url.hostname:
            raise HTTPException(status_code=400, detail="file URL is invalid")
        if parsed_download_url.username or parsed_download_url.password:
            raise HTTPException(status_code=400, detail="file URL user info is not allowed")
        suffix = Path(file_url.split("?")[0]).suffix or ".bin"
        target = Path(tempfile.gettempdir()) / f"aetherflow-input-{uuid.uuid4().hex}{suffix}"
        if download_url != file_url:
            logger.info("Rewrote fileUrl for container download from %s to %s", file_url, download_url)
        max_bytes = max(1, int(os.getenv("FILE_DOWNLOAD_MAX_BYTES", str(2 * 1024 * 1024 * 1024))))
        try:
            with httpx.stream(
                "GET",
                download_url,
                timeout=float(os.getenv("FILE_DOWNLOAD_TIMEOUT_SECONDS", "60")),
                follow_redirects=False,
            ) as response:
                response.raise_for_status()
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > max_bytes:
                    raise HTTPException(status_code=413, detail="input file is too large")
                total_bytes = 0
                with target.open("wb") as output:
                    for chunk in response.iter_bytes():
                        total_bytes += len(chunk)
                        if total_bytes > max_bytes:
                            raise HTTPException(status_code=413, detail="input file is too large")
                        output.write(chunk)
            return target
        except Exception:
            target.unlink(missing_ok=True)
            raise
    source = Path(file_url)
    if not source.exists():
        raise HTTPException(status_code=400, detail=f"input file does not exist: {file_url}")
    return source


def _rewrite_file_url(file_url: str) -> str:
    rewrite_from = os.getenv("FILE_URL_REWRITE_FROM", "").strip().rstrip("/")
    rewrite_to = os.getenv("FILE_URL_REWRITE_TO", "").strip().rstrip("/")
    if not rewrite_from or not rewrite_to:
        return file_url
    if file_url == rewrite_from:
        return rewrite_to
    if file_url.startswith(f"{rewrite_from}/"):
        return f"{rewrite_to}{file_url[len(rewrite_from):]}"
    return file_url


def _ensure_audio_source(source: Path) -> Path:
    suffix = source.suffix.lower()
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac"}:
        return source
    if suffix in {".mp4", ".mov", ".mkv", ".webm", ".avi"}:
        if shutil.which("ffmpeg") is None:
            raise HTTPException(status_code=503, detail="ffmpeg is not installed")
        target = Path(tempfile.gettempdir()) / f"aetherflow-audio-{uuid.uuid4().hex}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(source), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(target)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=int(os.getenv("FFMPEG_TIMEOUT_SECONDS", "120")),
        )
        return target
    raise HTTPException(status_code=400, detail=f"unsupported media format: {suffix}")


def _segments_to_srt(segments: Any) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{_format_srt_ts(segment.start)} --> {_format_srt_ts(segment.end)}")
        lines.append(segment.text.strip())
        lines.append("")
    return "\n".join(lines)


def _text_to_subtitle(text: str, fmt: str, line_seconds: float) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()] or [text.strip()]
    output: list[str] = ["WEBVTT", ""] if fmt == "vtt" else []
    for index, line in enumerate(lines, start=1):
        start = (index - 1) * line_seconds
        end = index * line_seconds
        if fmt == "srt":
            output.append(str(index))
            output.append(f"{_format_srt_ts(start)} --> {_format_srt_ts(end)}")
        else:
            output.append(f"{_format_vtt_ts(start)} --> {_format_vtt_ts(end)}")
        output.append(line)
        output.append("")
    return "\n".join(output)


def _format_srt_ts(seconds: float) -> str:
    milliseconds = int((seconds % 1) * 1000)
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"


def _format_vtt_ts(seconds: float) -> str:
    return _format_srt_ts(seconds).replace(",", ".")


def _cleanup_materialized(source: Path, audio_source: Path) -> None:
    temp_dir = Path(tempfile.gettempdir())
    for path in {source, audio_source}:
        try:
            if temp_dir in path.parents and path.exists():
                path.unlink()
        except OSError:
            logger.warning("Failed to cleanup temp file %s", path)


def _enabled(name: str) -> bool:
    return os.getenv(name, "true").lower() == "true"


def _whisper_runtime_ready() -> bool:
    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError as exc:
        logger.warning("Whisper runtime is enabled but unavailable: %s", exc)
        return False
    return True
