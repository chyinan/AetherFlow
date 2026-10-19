package com.aetherflow.workflow.http;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ingestion.url.UrlIngestionProperties;
import com.aetherflow.workflow.ingestion.url.UrlRequestPolicy;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.Flow;

/** 同步 JSON 请求；不跟随重定向、不保存凭据、不自动轮询或重试。 */
@Service
public class HttpJsonRequestService {
    public static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD");
    private final UrlIngestionProperties properties;
    private final UrlRequestPolicy urlPolicy;
    private final ObjectMapper json;
    private final HttpClient client;

    @Autowired
    public HttpJsonRequestService(UrlIngestionProperties properties, UrlRequestPolicy urlPolicy, ObjectMapper json) {
        this(properties, urlPolicy, json, HttpClient.newBuilder()
                .connectTimeout(timeout(properties)).followRedirects(HttpClient.Redirect.NEVER).build());
    }

    protected HttpJsonRequestService(UrlIngestionProperties properties, UrlRequestPolicy urlPolicy,
                           ObjectMapper json, HttpClient client) {
        this.properties = properties;
        this.urlPolicy = urlPolicy;
        this.json = json;
        this.client = client;
    }

    public Response request(String url, String method, Object body, boolean hasBody) {
        return request(url, method, body, hasBody, Map.of());
    }

    public Response request(String url, String method, Object body, boolean hasBody, Map<String, String> headers) {
        String normalizedMethod = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if (!METHODS.contains(normalizedMethod)) {
            throw invalid("HTTP 请求方法不受支持");
        }
        if (hasBody && Set.of("GET", "HEAD").contains(normalizedMethod)) {
            throw invalid("GET/HEAD 请求不能配置 JSON 请求体");
        }
        byte[] payload = hasBody ? serialize(body) : new byte[0];
        if (payload.length > maxBytes()) {
            throw invalid("HTTP JSON 请求体超过大小限制");
        }
        URI uri = urlPolicy.validateUri(url);
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(timeout(properties))
                .header("Accept", "application/json")
                .header("User-Agent", properties.getUserAgent() == null || properties.getUserAgent().isBlank()
                        ? "AetherFlow-UrlIngestion/1.0" : properties.getUserAgent());
        if (hasBody) builder.header("Content-Type", "application/json; charset=utf-8");
        headers.forEach((name, value) -> {
            if (value == null || value.contains("\r") || value.contains("\n") || value.length() > 8192) throw invalid("HTTP 请求头值无效");
            builder.setHeader(name, value);
        });
        HttpRequest request = builder.method(normalizedMethod, hasBody
                ? HttpRequest.BodyPublishers.ofByteArray(payload) : HttpRequest.BodyPublishers.noBody()).build();
        var pending = client.sendAsync(request, ignored -> new LimitedBodySubscriber(maxBytes()));
        try {
            // 同步等待完整有界响应；额外截止时间也覆盖收到响应头后的慢速响应体。
            HttpResponse<byte[]> response = pending.get(Math.max(1, timeout(properties).toMillis()), TimeUnit.MILLISECONDS);
            String text = new String(response.body(), StandardCharsets.UTF_8);
            Object parsed = null;
            boolean ok = response.statusCode() >= 200 && response.statusCode() < 300;
            String error = ok ? "" : "HTTP_STATUS_ERROR";
            if (!text.isBlank()) {
                try {
                    parsed = json.readerFor(Object.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(text);
                } catch (IOException exception) {
                    if (ok) error = "INVALID_JSON_RESPONSE";
                    ok = false;
                }
            }
            return new Response(response.statusCode(), parsed, text, ok, error);
        } catch (ExecutionException | TimeoutException exception) {
            pending.cancel(true);
            return new Response(0, null, "", false, "HTTP_REQUEST_FAILED");
        } catch (InterruptedException exception) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "HTTP 请求已中断");
        }
    }

    private byte[] serialize(Object body) {
        try {
            return json.writeValueAsBytes(body);
        } catch (IOException exception) {
            throw invalid("HTTP 请求体必须是有效 JSON");
        }
    }

    private int maxBytes() {
        return Math.max(16 * 1024, properties.getMaxBytes());
    }

    private static Duration timeout(UrlIngestionProperties properties) {
        return properties.getTimeout() == null ? Duration.ofSeconds(15) : properties.getTimeout();
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ResultCode.BAD_REQUEST, message);
    }

    public record Response(int statusCode, Object body, String bodyText, boolean ok, String error) {}

    static final class LimitedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private final int limit;
        private Flow.Subscription subscription;
        private long received;
        private boolean failed;

        LimitedBodySubscriber(int limit) { this.limit = limit; }
        @Override public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        @Override public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            delegate.onSubscribe(subscription);
        }
        @Override public void onNext(List<ByteBuffer> buffers) {
            if (failed) return;
            for (ByteBuffer buffer : buffers) received += buffer.remaining();
            if (received > limit) {
                failed = true;
                subscription.cancel();
                delegate.onError(new IOException("HTTP 响应超过大小限制"));
            } else delegate.onNext(buffers);
        }
        @Override public void onError(Throwable error) { if (!failed) delegate.onError(error); }
        @Override public void onComplete() { if (!failed) delegate.onComplete(); }
    }
}
