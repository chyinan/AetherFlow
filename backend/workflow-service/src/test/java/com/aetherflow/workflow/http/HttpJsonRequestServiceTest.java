package com.aetherflow.workflow.http;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ingestion.url.UrlIngestionProperties;
import com.aetherflow.workflow.ingestion.url.UrlRequestPolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Flow;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class HttpJsonRequestServiceTest {
    private HttpClient client;
    private UrlRequestPolicy policy;
    private HttpJsonRequestService service;

    @BeforeEach
    void setup() {
        client = mock(HttpClient.class);
        policy = mock(UrlRequestPolicy.class);
        when(policy.validateUri("https://example.com/api")).thenReturn(URI.create("https://example.com/api"));
        service = new HttpJsonRequestService(new UrlIngestionProperties(), policy, new ObjectMapper(), client);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"})
    void supportsConfiguredMethodsWithoutRealRequests(String method) throws Exception {
        respond(200, "{\"items\":[1,2]}");
        var result = service.request("https://example.com/api", method, null, false);
        assertThat(result.ok()).isTrue();
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.body()).isEqualTo(Map.of("items", List.of(1, 2)));
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).sendAsync(request.capture(), anyBodyHandler());
        assertThat(request.getValue().method()).isEqualTo(method);
        assertThat(request.getValue().timeout()).contains(java.time.Duration.ofSeconds(15));
        verify(policy).validateUri("https://example.com/api");
    }

    @Test
    void serializesJsonBodyAndContentType() throws Exception {
        respond(201, "true");
        var result = service.request("https://example.com/api", "POST", Map.of("message", "你好"), true);
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).sendAsync(request.capture(), anyBodyHandler());
        assertThat(request.getValue().headers().firstValue("Content-Type")).contains("application/json; charset=utf-8");
        var subscriber = HttpResponse.BodySubscribers.ofByteArray();
        request.getValue().bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            @Override public void onSubscribe(Flow.Subscription subscription) { subscriber.onSubscribe(subscription); }
            @Override public void onNext(ByteBuffer buffer) { subscriber.onNext(List.of(buffer)); }
            @Override public void onError(Throwable error) { subscriber.onError(error); }
            @Override public void onComplete() { subscriber.onComplete(); }
        });
        assertThat(new String(subscriber.getBody().toCompletableFuture().join(), StandardCharsets.UTF_8))
                .isEqualTo("{\"message\":\"你好\"}");
        assertThat(result.body()).isEqualTo(true);
    }

    @Test
    void keepsStatusAndTextOnNonSuccessResponse() throws Exception {
        respond(422, "{\"message\":\"invalid input\"}");
        var result = service.request("https://example.com/api", "POST", List.of(1), true);
        assertThat(result.ok()).isFalse();
        assertThat(result.statusCode()).isEqualTo(422);
        assertThat(result.error()).isEqualTo("HTTP_STATUS_ERROR");
        assertThat(result.body()).isEqualTo(Map.of("message", "invalid input"));
    }

    @Test
    void treatsInvalidOrTrailingJsonAsResponseError() throws Exception {
        for (String body : List.of("<html>unexpected</html>", "{} {}")) {
            respond(200, body);
            var result = service.request("https://example.com/api", "GET", null, false);
            assertThat(result.error()).isEqualTo("INVALID_JSON_RESPONSE");
            assertThat(result.bodyText()).isEqualTo(body);
            assertThat(result.ok()).isFalse();
        }
    }

    @Test
    void acceptsEmptyAndJsonNullBodies() throws Exception {
        for (String body : List.of("", "null")) {
            respond(204, body);
            var result = service.request("https://example.com/api", "GET", null, false);
            assertThat(result.ok()).isTrue();
            assertThat(result.body()).isNull();
        }
    }

    @Test
    void mapsTransportFailureWithoutExposingExceptionDetails() throws Exception {
        when(client.sendAsync(any(HttpRequest.class), anyBodyHandler())).thenReturn(CompletableFuture.failedFuture(new IOException("private details")));
        var result = service.request("https://example.com/api", "GET", null, false);
        assertThat(result.statusCode()).isZero();
        assertThat(result.error()).isEqualTo("HTTP_REQUEST_FAILED");
        assertThat(result.bodyText()).isEmpty();
    }

    @Test
    void preservesInterruption() throws Exception {
        when(client.sendAsync(any(HttpRequest.class), anyBodyHandler())).thenReturn(new CompletableFuture<>());
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(() -> service.request("https://example.com/api", "GET", null, false)).isInstanceOf(BusinessException.class);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally { Thread.interrupted(); }
    }

    @Test
    void cancelsRequestWhenFullBodyDoesNotCompleteByDeadline() {
        var properties = new UrlIngestionProperties();
        properties.setTimeout(java.time.Duration.ofMillis(5));
        service = new HttpJsonRequestService(properties, policy, new ObjectMapper(), client);
        CompletableFuture<HttpResponse<byte[]>> pending = new CompletableFuture<>();
        when(client.sendAsync(any(HttpRequest.class), anyBodyHandler())).thenReturn(pending);
        var result = service.request("https://example.com/api", "GET", null, false);
        assertThat(result.error()).isEqualTo("HTTP_REQUEST_FAILED");
        assertThat(pending.isCancelled()).isTrue();
    }

    @Test
    void rejectsIncompatibleMethodBodyBeforeSending() {
        assertThatThrownBy(() -> service.request("https://example.com/api", "HEAD", Map.of(), true)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.request("https://example.com/api", "unknown", null, false)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(client);
    }

    @Test
    void boundsRequestAndResponsePayloadsWithoutNetwork() {
        assertThatThrownBy(() -> service.request("https://example.com/api", "POST", "x".repeat(512 * 1024), true))
                .isInstanceOf(BusinessException.class);
        var subscription = mock(Flow.Subscription.class);
        var subscriber = new HttpJsonRequestService.LimitedBodySubscriber(4);
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1, 2, 3})));
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{4, 5})));
        verify(subscription).cancel();
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().join()).hasCauseInstanceOf(IOException.class);
        verifyNoInteractions(client);
    }

    private static HttpResponse.BodyHandler<byte[]> anyBodyHandler() {
        return any();
    }

    @SuppressWarnings("unchecked")
    private void respond(int status, String body) throws Exception {
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));
        when(client.sendAsync(any(HttpRequest.class), anyBodyHandler())).thenReturn(CompletableFuture.completedFuture(response));
    }
}
