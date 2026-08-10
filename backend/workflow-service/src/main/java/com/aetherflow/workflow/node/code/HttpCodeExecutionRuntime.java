package com.aetherflow.workflow.node.code;

// pattern: Imperative Shell
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class HttpCodeExecutionRuntime implements CodeExecutionRuntime {

    private final WorkflowNodeProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    @Override
    public CodeExecutionResult execute(String language, String code, Object input, int timeoutMs, int maxOutputBytes) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("language", language);
        payload.put("code", code);
        payload.put("input", input);
        payload.put("timeoutMs", timeoutMs);
        payload.put("maxOutputBytes", maxOutputBytes);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getCodeRuntimeUrl().replaceAll("/+$", "") + "/v1/code/execute"))
                    .timeout(Duration.ofMillis(timeoutMs + 2_000L))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode body = objectMapper.readTree(response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String message = body.path("detail").asText(body.path("message").asText("isolated code runtime rejected the request"));
                throw new BusinessException(ResultCode.BAD_REQUEST, message);
            }
            return new CodeExecutionResult(
                    objectMapper.convertValue(body.get("result"), Object.class),
                    body.path("stdout").asText(""),
                    body.path("durationMs").asLong(0),
                    body.path("truncated").asBoolean(false)
            );
        } catch (BusinessException exception) {
            throw exception;
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "code runtime request serialization failed");
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "isolated code runtime is unavailable");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "isolated code runtime request interrupted");
        }
    }
}
