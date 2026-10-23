import asyncio
import json
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main

ollama = pytest.importorskip("ollama")
GenerateResponse = ollama.GenerateResponse


class FakeAsyncStream:
    """只控制异步迭代边界，不访问外部模型或凭据。"""

    def __init__(self, chunks, error=None):
        self.chunks = list(chunks)
        self.error = error
        self.close_calls = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.chunks:
            return self.chunks.pop(0)
        if self.error is not None:
            raise self.error
        raise StopAsyncIteration

    async def aclose(self):
        self.close_calls += 1


class FakeAsyncClient:
    def __init__(self, chunks, error=None):
        self.stream = FakeAsyncStream(chunks, error)
        self.close_calls = 0
        self.generate_calls = []

    async def generate(self, **kwargs):
        self.generate_calls.append(kwargs)
        return self.stream

    async def close(self):
        self.close_calls += 1


class FakeResponseClient:
    """返回单个非流式响应，并记录关闭状态。"""

    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.close_calls = 0

    async def generate(self, **kwargs):
        if self.error is not None:
            raise self.error
        return self.response

    async def close(self):
        self.close_calls += 1


class FakeSyncStream:
    def __init__(self, chunks, error=None):
        self.chunks = list(chunks)
        self.error = error

    def __iter__(self):
        return self

    def __next__(self):
        if self.chunks:
            return self.chunks.pop(0)
        if self.error is not None:
            raise self.error
        raise StopIteration


class FakeSyncClient:
    def __init__(self, chunks, error=None):
        self.stream = FakeSyncStream(chunks, error)
        self.generate_calls = []

    def generate(self, **kwargs):
        self.generate_calls.append(kwargs)
        return self.stream


def request():
    return main.LlmRequest(provider="ollama", model="test-model", prompt="hello")


def sdk_chunks():
    """固定依赖 ollama 0.4.x 的流式返回是 GenerateResponse 对象，不是字典。"""
    return [
        GenerateResponse(model="test-model", response="你", done=False),
        GenerateResponse(model="test-model", response="", done=False),
        GenerateResponse(model="test-model", response="好", done=False),
        GenerateResponse(model="test-model", response="", done=True),
    ]


def test_async_stream_reads_sdk_response_objects(monkeypatch):
    client = FakeAsyncClient(sdk_chunks())
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    async def collect():
        return [event async for event in main._stream_ollama_async(request())]

    events = asyncio.run(collect())

    assert [event["text"] for event in events] == ["你", "好"]
    assert all(event["provider"] == "ollama" for event in events)
    assert client.stream.close_calls == 1
    assert client.close_calls == 1


def test_sync_stream_reads_sdk_response_objects(monkeypatch):
    client = FakeSyncClient(sdk_chunks())
    monkeypatch.setattr(main, "_ollama_client", lambda timeout_seconds=None: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    events = list(main._stream_ollama(request()))

    assert [event["text"] for event in events] == ["你", "好"]


def test_legacy_dict_chunks_remain_supported(monkeypatch):
    # 旧字典格式同样以 done=true 收尾。
    client = FakeAsyncClient([{"response": "旧"}, {"response": "", "done": True}])
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    async def collect():
        return [event async for event in main._stream_ollama_async(request())]

    events = asyncio.run(collect())

    assert [event["text"] for event in events] == ["旧"]


@pytest.mark.parametrize("response", [
    {"response": "部分回答", "done": False},
    {"response": "缺少完成字段"},
    GenerateResponse(model="test-model", response="SDK 部分回答", done=False),
])
def test_non_stream_ollama_rejects_incomplete_or_unmarked_responses(monkeypatch, response):
    client = FakeResponseClient(response)
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    with pytest.raises(main.HTTPException) as raised:
        asyncio.run(main._call_ollama_async(request()))

    assert raised.value.status_code == 502
    assert client.close_calls == 1


@pytest.mark.parametrize("response", [
    {"response": "完整回答", "done": True},
    GenerateResponse(model="test-model", response="SDK 完整回答", done=True),
])
def test_non_stream_ollama_returns_only_completed_response(monkeypatch, response):
    client = FakeResponseClient(response)
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    result = asyncio.run(main._call_ollama_async(request()))

    assert result.text in {"完整回答", "SDK 完整回答"}
    assert result.metadata["done"] is True
    assert client.close_calls == 1


def test_non_stream_ollama_propagates_provider_error_and_closes(monkeypatch):
    client = FakeResponseClient(error=RuntimeError("provider failed"))
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    with pytest.raises(RuntimeError, match="provider failed"):
        asyncio.run(main._call_ollama_async(request()))

    assert client.close_calls == 1


def test_provider_failure_propagates_and_closes_client(monkeypatch):
    client = FakeAsyncClient([GenerateResponse(model="test-model", response="半", done=False)],
                              error=RuntimeError("provider failed"))
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    async def collect():
        return [event async for event in main._stream_ollama_async(request())]

    with pytest.raises(RuntimeError, match="provider failed"):
        asyncio.run(collect())

    assert client.stream.close_calls == 1
    assert client.close_calls == 1


def test_cancelled_consumer_closes_stream_and_client(monkeypatch):
    class BlockingStream(FakeAsyncStream):
        def __init__(self):
            super().__init__([])
            self.started = asyncio.Event()
            self.cancelled = False

        async def __anext__(self):
            self.started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled = True
                raise

    client = FakeAsyncClient([])
    client.stream = BlockingStream()
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    async def cancel_consumer():
        consumer = asyncio.create_task(_drain(main._stream_ollama_async(request())))
        await asyncio.wait_for(client.stream.started.wait(), timeout=1)
        consumer.cancel()
        with pytest.raises(asyncio.CancelledError):
            await consumer

    asyncio.run(cancel_consumer())

    assert client.stream.cancelled
    assert client.stream.close_calls == 1
    assert client.close_calls == 1


async def _drain(generator):
    return [event async for event in generator]


class FakeRequest:
    def __init__(self):
        self.disconnected = False

    async def is_disconnected(self):
        return self.disconnected


@pytest.fixture
def stream_runtime(monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")
    monkeypatch.setenv("AI_PROVIDER_MAX_TIMEOUT_SECONDS", "1800")
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)
    monkeypatch.setattr(main, "_resolve_provider_model", lambda request, provider: request)
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(main, "_llm_slots", slots)
    return slots


def stream_events(monkeypatch, client):
    """走真实流式入口与真实 ollama 读取路径，只替换 SDK 客户端。"""
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    response = main.llm_chat_stream(
        main.LlmRequest(provider="ollama", model="test-model", prompt="hello", timeoutSeconds=10),
        FakeRequest(),
    )

    async def consume():
        return [event async for event in response.body_iterator]

    return asyncio.run(consume())


def test_stream_with_terminal_chunk_completes(stream_runtime, monkeypatch):
    client = FakeAsyncClient(sdk_chunks())

    events = stream_events(monkeypatch, client)

    assert events[-1] == "data: [DONE]\n\n"
    assert "".join(events).count("[DONE]") == 1
    assert json.loads(events[0].removeprefix("data: "))["text"] == "你"


def test_stream_without_terminal_chunk_is_an_error_not_a_completion(stream_runtime, monkeypatch):
    # 受影响旧 Ollama 正常 EOF 但没有 done=true 终块：不能把半截回答当完成。
    client = FakeAsyncClient([GenerateResponse(model="test-model", response="半截回答", done=False)])

    events = stream_events(monkeypatch, client)

    assert "[DONE]" not in "".join(events)
    assert events[-1].startswith("event: error\ndata: ")
    payload = json.loads(events[-1].split("data: ", 1)[1].strip())
    assert payload["error"]["code"] == "stream_incomplete"


def test_empty_stream_is_an_error_not_a_completion(stream_runtime, monkeypatch):
    client = FakeAsyncClient([])

    events = stream_events(monkeypatch, client)

    assert "[DONE]" not in "".join(events)
    assert events[-1].startswith("event: error\ndata: ")


def test_provider_failure_during_stream_is_not_reported_as_completion(stream_runtime, monkeypatch):
    client = FakeAsyncClient([GenerateResponse(model="test-model", response="半截", done=False)],
                             error=RuntimeError("provider failed"))

    # Provider 异常沿用既有语义向上冒泡：不会发 [DONE]，半截回答不算完成。
    with pytest.raises(RuntimeError, match="provider failed"):
        stream_events(monkeypatch, client)


def test_cancelled_consumer_does_not_report_completion(stream_runtime, monkeypatch):
    class BlockingStream(FakeAsyncStream):
        def __init__(self):
            super().__init__([])
            self.started = asyncio.Event()
            self.cancelled = False

        async def __anext__(self):
            self.started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled = True
                raise

    client = FakeAsyncClient([])
    client.stream = BlockingStream()
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    response = main.llm_chat_stream(
        main.LlmRequest(provider="ollama", model="test-model", prompt="hello", timeoutSeconds=10),
        FakeRequest(),
    )

    async def cancel_consumer():
        consumer = asyncio.create_task(_drain(response.body_iterator))
        await asyncio.wait_for(client.stream.started.wait(), timeout=1)
        consumer.cancel()
        with pytest.raises(asyncio.CancelledError):
            await consumer

    asyncio.run(cancel_consumer())

    assert client.stream.cancelled
    assert client.stream.close_calls == 1
    assert client.close_calls == 1
