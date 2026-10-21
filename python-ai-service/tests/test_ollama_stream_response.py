import asyncio
import sys
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
    client = FakeAsyncClient([{"response": "旧"}, {"response": ""}])
    monkeypatch.setattr(ollama, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)

    async def collect():
        return [event async for event in main._stream_ollama_async(request())]

    events = asyncio.run(collect())

    assert [event["text"] for event in events] == ["旧"]


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
