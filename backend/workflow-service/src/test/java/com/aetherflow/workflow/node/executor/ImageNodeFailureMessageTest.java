package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import feign.FeignException;
import feign.Request;
import feign.Response;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ImageNodeFailureMessageTest {
    private static final String TOKEN = "[IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:REJECTED]";

    @Test
    void retainsOnlyWhitelistedTokenAndSafeAdvice() {
        assertThat(ImageNodeFailureMessage.knownMessage("secret-prefix " + TOKEN + " private-response"))
                .startsWith(TOKEN).contains("sampler").doesNotContain("secret", "private-response");
        assertThat(ImageNodeFailureMessage.knownMessage("[IMAGE_EXECUTION:COMFYUI:QUEUE:token:REJECTED]"))
                .isNull();
        assertThat(ImageNodeFailureMessage.knownMessage("[IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:SECRET]"))
                .isNull();
    }

    @Test
    void extractsTokenFromFeignBodyWithoutLeakingUrlOrBody() {
        Request request = Request.create(Request.HttpMethod.POST, "https://secret-host/api?token=private",
                Map.of(), null, StandardCharsets.UTF_8, null);
        FeignException exception = FeignException.errorStatus("execute", Response.builder().status(503)
                .reason("private reason").request(request).headers(Map.of())
                .body("{\"message\":\"" + TOKEN + " private-data\"}", StandardCharsets.UTF_8).build());
        assertThat(ImageNodeFailureMessage.fromException(exception, Map.of(), "IMAGE_GENERATION"))
                .startsWith(TOKEN).doesNotContain("secret-host", "private", "https");
    }

    @Test
    void handlesTimeoutAndInterruptionWithoutSuggestingImmediateRetry() {
        assertThat(ImageNodeFailureMessage.fromException(new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                "ai node call timed out after PT1M"), Map.of("provider", "COMFYUI"), "IMAGE_GENERATION"))
                .contains(":REQUEST:timeoutSeconds:TIMEOUT]", "远端任务可能仍在执行");
        assertThat(ImageNodeFailureMessage.fromException(new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                "ai node call interrupted, description=private"), Map.of(), "UPSCALE"))
                .contains("AI_SERVICE:REQUEST:connectionId:INTERRUPTED]", "远端任务可能仍在执行")
                .doesNotContain("private");
    }

    @Test
    void unknownErrorsBecomeSafeRequestFailureAndNonImageNodesAreExcluded() {
        assertThat(ImageNodeFailureMessage.fromResult("password=private", Map.of(), "IMAGE_GENERATION"))
                .contains("AI_SERVICE:REQUEST:connectionId:FAILED]").doesNotContain("password", "private");
        assertThat(ImageNodeFailureMessage.appliesTo("LLM")).isFalse();
        assertThat(ImageNodeFailureMessage.appliesTo("UPSCALE")).isTrue();
    }
}
