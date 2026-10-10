package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.executor.ImageGenerationAiNodeExecutor;
import com.aetherflow.ai.workflow.executor.UpscaleAiNodeExecutor;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NodeConnectionValidationRequest.NodeSelection;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NodeConnectionExecutionTest {
    @Test
    void explicitSavedSdConnectionActuallyReceivesGenerationAndUpscale() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        List<String> requests = new ArrayList<>();
        server.createContext("/selected/sdapi/v1/txt2img", exchange -> {
            requests.add(exchange.getRequestURI().getPath() + " " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"images\":[\"aW1hZ2U=\"]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/selected/sdapi/v1/extra-single-image", exchange -> {
            requests.add(exchange.getRequestURI().getPath() + " " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"image\":\"aW1hZ2U=\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/selected/sdapi/v1/img2img", exchange -> {
            requests.add(exchange.getRequestURI().getPath() + " " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"images\":[\"aW1hZ2U=\"]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            ImageProviderProperties defaults = new ImageProviderProperties();
            String endpoint = "http://127.0.0.1:" + server.getAddress().getPort() + "/selected";
            NodeConnectionProfile profile = new NodeConnectionProfile("saved-sd", "测试服务", "STABLE_DIFFUSION_WEBUI", endpoint, false);
            ImageGenerationProvider provider = new NodeConnectionProviderFactory(RestClient.builder(), defaults).create(profile);
            NodeConnectionService connections = mock(NodeConnectionService.class);
            when(connections.resolveForExecution(eq(7L), any(NodeSelection.class))).thenReturn(provider);
            ImageProviderRegistry registry = mock(ImageProviderRegistry.class);
            ImageGenerationAiNodeExecutor generation = new ImageGenerationAiNodeExecutor(registry);
            UpscaleAiNodeExecutor upscale = new UpscaleAiNodeExecutor(registry);
            ReflectionTestUtils.setField(generation, "connectionService", connections);
            ReflectionTestUtils.setField(upscale, "connectionService", connections);

            var generated = generation.execute(context(Map.of("connectionId", "saved-sd", "provider", "STABLE_DIFFUSION_WEBUI", "prompt", "cat")));
            var scaled = upscale.execute(context(Map.of("connectionId", "saved-sd", "provider", "STABLE_DIFFUSION_WEBUI",
                    "sourceImage", "aW1hZ2U=", "upscaler", "Lanczos", "scale", 4)));
            var transformed = generation.execute(context(Map.of("connectionId", "saved-sd", "provider", "STABLE_DIFFUSION_WEBUI",
                    "mode", "img2img", "sourceImage", "aW1hZ2U=", "prompt", "watercolor")));
            // 内部标准字段优先，兼容字段不应覆盖已解析的图像。
            generation.execute(context(Map.of("connectionId", "saved-sd", "provider", "STABLE_DIFFUSION_WEBUI",
                    "mode", "img2img", "sourceImage", "aW1hZ2U=", "sourceImageBase64", "cHJpb3JpdHk=")));

            assertThat(generated.artifacts()).hasSize(1);
            assertThat(scaled.artifacts()).hasSize(1);
            assertThat(transformed.artifacts()).hasSize(1);
            assertThat(requests).hasSize(4);
            assertThat(requests.get(0)).contains("/selected/sdapi/v1/txt2img", "cat");
            assertThat(requests.get(1)).contains("/selected/sdapi/v1/extra-single-image", "\"upscaler_1\":\"Lanczos\"", "\"upscaling_resize\":4");
            assertThat(requests.get(2)).contains("/selected/sdapi/v1/img2img", "\"init_images\":[\"aW1hZ2U=\"]", "watercolor");
            assertThat(requests.get(3)).contains("\"init_images\":[\"cHJpb3JpdHk=\"]").doesNotContain("aW1hZ2U=");
            assertThat(defaults.getStableDiffusion().isEnabled()).isFalse();
            verifyNoInteractions(registry);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void brokenExplicitSelectionDoesNotConsultLegacyRegistryForEitherNode() {
        NodeConnectionService connections = mock(NodeConnectionService.class);
        when(connections.resolveForExecution(eq(7L), any())).thenThrow(new BusinessException(ResultCode.BAD_REQUEST, "所选连接不存在"));
        ImageProviderRegistry registry = mock(ImageProviderRegistry.class);
        for (ImageGenerationAiNodeExecutor executor : List.of(new ImageGenerationAiNodeExecutor(registry), new UpscaleAiNodeExecutor(registry))) {
            ReflectionTestUtils.setField(executor, "connectionService", connections);
            assertThatThrownBy(() -> executor.execute(context(Map.of("connectionId", "missing"))))
                    .hasMessageContaining("所选连接不存在");
        }
        verifyNoInteractions(registry);
    }

    @Test
    void explicitProviderFailureDoesNotFailOver() {
        ImageGenerationProvider failed = mock(ImageGenerationProvider.class);
        when(failed.type()).thenReturn(ImageProviderType.COMFYUI);
        when(failed.generate(any(ImageGenerationRequest.class)))
                .thenThrow(new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "显式服务暂不可用"));
        NodeConnectionService connections = mock(NodeConnectionService.class);
        when(connections.resolveForExecution(eq(7L), any())).thenReturn(failed);
        ImageProviderRegistry registry = mock(ImageProviderRegistry.class);
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(registry);
        ReflectionTestUtils.setField(executor, "connectionService", connections);
        assertThatThrownBy(() -> executor.execute(context(Map.of("connectionId", "saved"))))
                .hasMessageContaining("显式服务暂不可用");
        verifyNoInteractions(registry);
    }

    private AiNodeExecutionContext context(Map<String, Object> payload) {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setUserId(7L);
        message.setNodeId("image");
        return new AiNodeExecutionContext(message, payload);
    }
}
