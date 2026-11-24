package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.executor.ImageGenerationAiNodeExecutor;
import com.aetherflow.common.util.ComfyUiWorkflow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigInteger;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ComfyUiLosslessDispatchTest {

    private static final BigInteger UINT64_MAX = new BigInteger("18446744073709551615");
    private static final BigInteger SIGNED_LONG_MAX_PLUS_ONE = new BigInteger("9223372036854775808");
    private static final String SOURCE = "{\n"
            + "  \"sampler\": {\"class_type\":\"KSampler\",\"inputs\":{"
            + "\"seed\":18446744073709551615,\"noise_seed\":9223372036854775808,"
            + "\"signed_max\":9223372036854775807,\"steps\":30,"
            + "\"positive\":[\"text\",0],\"nfc\":\"café\",\"nfd\":\"é\"},\"_meta\":{\"title\":\"保留元数据\"}},\n"
            + "  \"text\": {\"class_type\":\"ExamplePluginText\",\"inputs\":{\"text\":\"keep\"},\"_meta\":{\"title\":\"Plugin UI\"}}\n"
            + "}\n";

    @ParameterizedTest
    @ValueSource(longs = {9_007_199_254_740_993L, Long.MAX_VALUE})
    void dispatchesExactSeedOverridesAsUnquotedIntegers(long seed) throws Exception {
        ObjectMapper json = new ObjectMapper();
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        ComfyUiProvider provider = new ComfyUiProvider(builder.baseUrl("http://comfy").build(), properties);
        server.expect(requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(request -> {
                    JsonNode dispatched = json.readTree(((MockClientHttpRequest) request).getBodyAsBytes()).path("prompt");
                    JsonNode inputs = dispatched.path("sampler").path("inputs");
                    assertThat(inputs.path("seed").isIntegralNumber()).isTrue();
                    assertThat(inputs.path("seed").longValue()).isEqualTo(seed);
                    assertThat(inputs.path("noise_seed").bigIntegerValue()).isEqualTo(SIGNED_LONG_MAX_PLUS_ONE);
                })
                .andRespond(withSuccess("""
                        {"prompt_id":"exact"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/queue"))
                .andRespond(withSuccess("""
                        {"queue_running":[],"queue_pending":[]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/history/exact"))
                .andRespond(withSuccess("""
                        {"exact":{"outputs":{"out":{"images":[{"filename":"out.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/view?filename=out.png&subfolder=&type=output"))
                .andRespond(withSuccess("image", MediaType.IMAGE_PNG));

        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(null) {
            @Override
            protected ImageGenerationResponse executeConfigured(
                    AiNodeExecutionContext context, ImageGenerationRequest request, boolean upscale) {
                return provider.generate(request);
            }
        };
        executor.execute(new AiNodeExecutionContext(null, Map.of(
                "provider", "COMFYUI", "mode", "workflow", "workflowJson", SOURCE, "seed", seed,
                "workflowBindings", List.of(Map.of("nodeId", "sampler", "inputName", "seed", "parameter", "seed")))));
        server.verify();
    }

    @Test
    void dispatchesUint64AndSignedLongBoundaryAsExactJsonIntegersWithoutMutatingGraph() throws Exception {
        ObjectMapper json = new ObjectMapper();
        Map<String, Object> graph = ComfyUiWorkflow.decodeGraph(SOURCE);
        Map<String, Object> before = ComfyUiWorkflow.decodeGraph(SOURCE);

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        ComfyUiProvider provider = new ComfyUiProvider(builder.baseUrl("http://comfy").build(), properties);

        server.expect(requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(request -> {
                    String body = new String(((MockClientHttpRequest) request).getBodyAsBytes(), java.nio.charset.StandardCharsets.UTF_8);
                    assertThat(body).contains("\"seed\":18446744073709551615")
                            .contains("\"noise_seed\":9223372036854775808")
                            .contains("\"signed_max\":9223372036854775807");
                    JsonNode payload = json.readTree(body);
                    JsonNode dispatched = payload.path("prompt");
                    assertThat(dispatched.path("sampler").path("inputs").path("seed").bigIntegerValue()).isEqualTo(UINT64_MAX);
                    assertThat(dispatched.path("sampler").path("inputs").path("noise_seed").bigIntegerValue()).isEqualTo(SIGNED_LONG_MAX_PLUS_ONE);
                    assertThat(dispatched.path("sampler").path("inputs").path("signed_max").isLong()).isTrue();
                    assertThat(dispatched.path("sampler").path("inputs").path("signed_max").longValue()).isEqualTo(Long.MAX_VALUE);
                    assertThat(dispatched.path("sampler").path("inputs").path("steps").isInt()).isTrue();
                    assertThat(dispatched.path("sampler").path("inputs").path("positive").get(0).textValue()).isEqualTo("text");
                    assertThat(dispatched.path("sampler").path("inputs").path("positive").get(1).intValue()).isZero();
                    assertThat(dispatched.path("sampler").path("_meta").path("title").textValue()).isEqualTo("保留元数据");
                    assertThat(dispatched.path("text").path("_meta").path("title").textValue()).isEqualTo("Plugin UI");
                    assertThat(dispatched.path("text").path("inputs").path("text").textValue()).isEqualTo("prompt");
                    assertThat(dispatched.path("sampler").path("inputs").path("nfc").textValue()).isEqualTo("café");
                    assertThat(dispatched.path("sampler").path("inputs").path("nfd").textValue()).isEqualTo("é");
                })
                .andRespond(withSuccess("{\"prompt_id\":\"lossless\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/queue"))
                .andExpect(method(GET))
                .andRespond(withSuccess("{\"queue_running\":[],\"queue_pending\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/history/lossless"))
                .andExpect(method(GET))
                .andRespond(withSuccess("{\"lossless\":{\"outputs\":{\"out\":{\"images\":[{\"filename\":\"out.png\",\"subfolder\":\"\",\"type\":\"output\"}]}}}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/view?filename=out.png&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess("image", MediaType.IMAGE_PNG));

        ImageGenerationRequest request = new ImageGenerationRequest(ImageProviderType.COMFYUI, "workflow", "prompt", "",
                1L, 30, 7.5, "euler", "normal", 512, 512, 1, 0.65, "model.safetensors", null,
                List.of(), null, null, graph,
                Map.of("workflowBindings", List.of(Map.of("nodeId", "text", "inputName", "text", "parameter", "prompt"))),
                Duration.ofSeconds(1));
        provider.generate(request);
        server.verify();
        assertThat(graph).isEqualTo(before);
    }
}
