import asyncio
import json
import sys
import threading
from collections import deque
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main


class FakeRequest:
    def __init__(self):
        self.disconnected = False

    async def is_disconnected(self):
        return self.disconnected


class FakeProvider:
    """只控制异步迭代边界，不访问外部模型或凭据。"""

    def __init__(self, chunks=(), *, block=False, error=None, close_error=None):
        self.chunks = deque(chunks)
        self.block = block
        self.error = error
        self.close_error = close_error
        self.started = asyncio.Event()
        self.next_calls = 0
        self.close_calls = 0
        self.cancelled = False

    def __aiter__(self):
        return self

    async def __anext__(self):
        self.next_calls += 1
        if self.chunks:
            return self.chunks.popleft()
        if self.error is not None:
            raise self.error
        if self.block:
            self.started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled = True
                raise
        raise StopAsyncIteration

    async def aclose(self):
        self.close_calls += 1
        if self.close_error is not None:
            raise self.close_error


@pytest.fixture
def stream_runtime(monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")
    monkeypatch.setenv("AI_PROVIDER_MAX_TIMEOUT_SECONDS", "1800")
    monkeypatch.setattr(main, "_ensure_runtime_env_loaded", lambda: None)
    monkeypatch.setattr(main, "_resolve_provider_model", lambda request, provider: request)
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(main, "_llm_slots", slots)
    return slots


def stream_response(monkeypatch, fake, *, provider="ollama", timeout=0.1, request=None):
    monkeypatch.setattr(main, f"_stream_{provider}_async", lambda _request: fake)
    # 直接调用生产入口并消费真实 StreamingResponse，不复制实现或提取源码。
    return main.llm_chat_stream(
        main.LlmRequest(provider=provider, model="test-model", prompt="hello", timeoutSeconds=timeout),
        request or FakeRequest(),
    )


async def collect(response):
    return [event async for event in response.body_iterator]


def assert_released(slots):
    assert slots.acquire(blocking=False), "流结束后必须释放并发槽位"
    slots.release()


def assert_deadline_error(events):
    assert "[DONE]" not in "".join(events)
    assert events[-1].startswith("event: error\ndata: ")
    payload = events[-1].split("data: ", 1)[1].strip()
    assert json.loads(payload) == {
        "error": {"code": "deadline_exceeded", "message": "LLM provider deadline exceeded"}
    }


@pytest.mark.parametrize("provider", ["ollama", "openai"])
@pytest.mark.parametrize("chunks", [[], [
    {"text": "你好"},
    {"text": " "},
    {"text": "\n"},
    {"text": "\t"},
    {"text": " \t\n"},
    {"text": " world"},
]])
def test_normal_completion_emits_done_once(monkeypatch, stream_runtime, provider, chunks):
    fake = FakeProvider(chunks)
    response = stream_response(monkeypatch, fake, provider=provider, timeout=10)

    events = asyncio.run(collect(response))

    assert response.media_type == "text/event-stream"
    assert events == [f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n" for chunk in chunks] + [
        "data: [DONE]\n\n"
    ]
    assert fake.close_calls == 1
    assert_released(stream_runtime)


@pytest.mark.parametrize("provider", ["ollama", "openai"])
@pytest.mark.parametrize("chunks", [[], [{"text": "partial"}]])
def test_timeout_before_or_after_first_chunk_is_an_error(monkeypatch, stream_runtime, provider, chunks):
    fake = FakeProvider(chunks, block=True)
    response = stream_response(monkeypatch, fake, provider=provider)

    events = asyncio.run(collect(response))

    assert len(events) == len(chunks) + 1
    assert_deadline_error(events)
    if chunks:
        assert json.loads(events[0].removeprefix("data: ")) == chunks[0]
    assert fake.cancelled
    assert fake.close_calls == 1
    assert_released(stream_runtime)


def test_expired_deadline_between_chunks_does_not_poll_or_emit_done(monkeypatch, stream_runtime):
    fake = FakeProvider([{"text": "partial"}, {"text": "late"}])
    response = stream_response(monkeypatch, fake)

    async def consume_after_deadline():
        first = await anext(response.body_iterator)
        await asyncio.sleep(0.12)
        return [first] + await collect(response)

    events = asyncio.run(consume_after_deadline())

    assert len(events) == 2
    assert_deadline_error(events)
    assert fake.next_calls == 1
    assert fake.close_calls == 1
    assert_released(stream_runtime)


@pytest.mark.parametrize("after_chunk", [False, True])
def test_disconnected_client_does_not_receive_done(monkeypatch, stream_runtime, after_chunk):
    fake = FakeProvider([{"text": "partial"}, {"text": "late"}])
    request = FakeRequest()
    response = stream_response(monkeypatch, fake, request=request)

    async def disconnect():
        events = [await anext(response.body_iterator)] if after_chunk else []
        request.disconnected = True
        return events + await collect(response)

    events = asyncio.run(disconnect())

    assert len(events) == int(after_chunk)
    assert "[DONE]" not in "".join(events)
    assert fake.close_calls == 1
    assert_released(stream_runtime)


@pytest.mark.parametrize("chunks", [[], [{"text": "partial"}]])
def test_provider_failure_closes_iterator_and_releases_slot(monkeypatch, stream_runtime, chunks):
    fake = FakeProvider(chunks, error=RuntimeError("provider failed"))
    response = stream_response(monkeypatch, fake)
    events = []

    async def consume_failure():
        with pytest.raises(RuntimeError, match="provider failed"):
            async for event in response.body_iterator:
                events.append(event)

    asyncio.run(consume_failure())

    assert len(events) == len(chunks)
    assert "[DONE]" not in "".join(events)
    assert fake.close_calls == 1
    assert_released(stream_runtime)


def test_cancelled_consumer_closes_iterator_and_releases_slot(monkeypatch, stream_runtime):
    fake = FakeProvider(block=True)
    response = stream_response(monkeypatch, fake, timeout=10)

    async def cancel_consumer():
        consumer = asyncio.create_task(collect(response))
        await asyncio.wait_for(fake.started.wait(), timeout=1)
        consumer.cancel()
        with pytest.raises(asyncio.CancelledError):
            await consumer

    asyncio.run(cancel_consumer())

    assert fake.cancelled
    assert fake.close_calls == 1
    assert_released(stream_runtime)


def test_explicit_stream_close_releases_slot(monkeypatch, stream_runtime):
    fake = FakeProvider([{"text": "partial"}], block=True)
    response = stream_response(monkeypatch, fake)

    async def close_consumer():
        await anext(response.body_iterator)
        await response.body_iterator.aclose()

    asyncio.run(close_consumer())

    assert fake.close_calls == 1
    assert_released(stream_runtime)


@pytest.mark.parametrize("close_error", [RuntimeError("close failed"), asyncio.CancelledError()])
def test_iterator_close_failure_still_releases_slot(monkeypatch, stream_runtime, close_error):
    fake = FakeProvider(close_error=close_error)
    response = stream_response(monkeypatch, fake)

    with pytest.raises(type(close_error)):
        asyncio.run(collect(response))

    assert fake.close_calls == 1
    assert_released(stream_runtime)


def test_provider_initialization_failure_releases_slot(monkeypatch, stream_runtime):
    def fail_to_start(_request):
        raise RuntimeError("provider initialization failed")

    response = stream_response(monkeypatch, FakeProvider())
    monkeypatch.setattr(main, "_stream_ollama_async", fail_to_start)

    with pytest.raises(RuntimeError, match="provider initialization failed"):
        asyncio.run(collect(response))

    assert_released(stream_runtime)
