package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ComfyUiWorkflowParametersTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private RestClient restClient;
    private ImageProviderProperties properties;
    private MockRestServiceServer server;
    private ComfyUiProvider provider;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        restClient = builder.baseUrl("http://comfy").build();
        properties = new ImageProviderProperties();
        properties.getComfy().setPollInterval(Duration.ZERO);
        provider = new ComfyUiProvider(restClient, properties);
    }

    @ParameterizedTest
    @ValueSource(strings = {"txt2img", "img2img", "workflow"})
    void resolvesRandomSentinelForDefaultWorkflows(String mode) {
        expectGeneration(mode, graph -> assertThat(inputs(graph, "img2img".equals(mode) ? "6" : "5")
                .path("seed").longValue()).isNotNegative());

        generate(request(mode, -1L, null, Map.of(), List.of()));
    }

    @ParameterizedTest
    @CsvSource({"txt2img,0", "img2img,0", "workflow,0", "txt2img,7", "img2img,7", "workflow,7",
            "txt2img,9223372036854775807", "img2img,9223372036854775807", "workflow,9223372036854775807"})
    void preservesExplicitNonNegativeSeeds(String mode, long seed) {
        expectGeneration(mode, graph -> assertThat(inputs(graph, "img2img".equals(mode) ? "6" : "5")
                .path("seed").longValue()).isEqualTo(seed));

        generate(request(mode, seed, null, Map.of(), List.of()));
    }

    @Test
    void selectedImg2imgVaeFeedsBothEncodeAndDecode() {
        expectGeneration("img2img", graph -> {
            assertThat(inputs(graph, "9").path("vae_name").textValue()).isEqualTo("selected.safetensors");
            assertThat(inputs(graph, "5").path("vae")).isEqualTo(objectMapper.valueToTree(List.of("9", 0)));
            assertThat(inputs(graph, "7").path("vae")).isEqualTo(inputs(graph, "5").path("vae"));
            assertThat(inputs(graph, "6").path("latent_image")).isEqualTo(objectMapper.valueToTree(List.of("5", 0)));
        });

        generate(request("img2img", 7L, "selected.safetensors", Map.of(), List.of()));
    }

    @Test
    void selectedImg2imgVaeStillFeedsBothNodesAfterLoraLoaders() {
        expectGeneration("img2img", graph -> {
            assertThat(graph.path("9").path("class_type").textValue()).isEqualTo("LoraLoader");
            assertThat(inputs(graph, "10").path("vae_name").textValue()).isEqualTo("selected.safetensors");
            assertThat(inputs(graph, "5").path("vae")).isEqualTo(objectMapper.valueToTree(List.of("10", 0)));
            assertThat(inputs(graph, "7").path("vae")).isEqualTo(inputs(graph, "5").path("vae"));
            assertThat(inputs(graph, "6").path("model")).isEqualTo(objectMapper.valueToTree(List.of("9", 0)));
        });

        generate(request("img2img", 7L, "selected.safetensors", Map.of(),
                List.of(Map.of("name", "style.safetensors", "weight", 0.7))));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void absentImg2imgVaeKeepsCheckpointEncodeAndDecode(String vae) {
        expectGeneration("img2img", graph -> {
            assertThat(graph.has("9")).isFalse();
            assertThat(inputs(graph, "5").path("vae")).isEqualTo(objectMapper.valueToTree(List.of("1", 2)));
            assertThat(inputs(graph, "7").path("vae")).isEqualTo(inputs(graph, "5").path("vae"));
        });

        generate(request("img2img", 7L, vae, Map.of(), List.of()));
    }

    @Test
    void selectedTxt2imgVaeStillFeedsOnlyDecode() {
        expectGeneration("txt2img", graph -> {
            assertThat(graph.path("4").path("class_type").textValue()).isEqualTo("EmptyLatentImage");
            assertThat(inputs(graph, "8").path("vae_name").textValue()).isEqualTo("selected.safetensors");
            assertThat(inputs(graph, "6").path("vae")).isEqualTo(objectMapper.valueToTree(List.of("8", 0)));
            assertThat(graph).noneMatch(node -> "VAEEncode".equals(node.path("class_type").textValue()));
        });

        generate(request("txt2img", 7L, "selected.safetensors", Map.of(), List.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"txt2img", "img2img", "workflow"})
    void drawsOneFreshSeedPerGenerationAndSharesItAcrossImportedNodes(String mode) {
        AtomicLong nextSeed = new AtomicLong(40L);
        provider = new ComfyUiProvider(restClient, properties, nextSeed::incrementAndGet);
        Map<String, Object> workflow = importedWorkflow();
        ImageGenerationRequest request = request(mode, -1L, null, workflow, List.of());
        expectGeneration(mode, graph -> assertImportedSeed(graph, 41L));
        expectGeneration(mode, graph -> assertImportedSeed(graph, 42L));

        provider.generate(request);
        generate(request);

        assertThat(nextSeed.get()).isEqualTo(42L);
        assertThat(objectMapper.<JsonNode>valueToTree(workflow)).isEqualTo(objectMapper.valueToTree(importedWorkflow()));
        assertThat(request.seed()).isEqualTo(-1L);
    }

    @ParameterizedTest
    @CsvSource({"-9223372036854775808,0", "-1,9223372036854775807", "0,0", "9223372036854775807,9223372036854775807"})
    void mapsRandomLongBoundariesToLegalSeeds(long randomValue, long expectedSeed) {
        AtomicInteger draws = new AtomicInteger();
        provider = new ComfyUiProvider(restClient, properties, () -> {
            draws.incrementAndGet();
            return randomValue;
        });
        expectGeneration("txt2img", graph -> assertThat(inputs(graph, "5").path("seed").longValue())
                .isEqualTo(expectedSeed));

        generate(request("txt2img", -1L, null, Map.of(), List.of()));
        assertThat(draws.get()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(longs = {0L, 7L, Long.MAX_VALUE})
    void explicitImportedSeedKeepsExistingOverrideContractWithoutDrawingRandomness(long seed) {
        provider = new ComfyUiProvider(restClient, properties, () -> {
            throw new AssertionError("固定种子不应读取随机数");
        });
        expectGeneration("workflow", graph -> assertImportedSeed(graph, seed));

        generate(request("workflow", seed, null, importedWorkflow(), List.of()));
    }

    @Test
    void absentSeedKeepsDefaultSeedAndDistinctImportedSeeds() {
        provider = new ComfyUiProvider(restClient, properties, () -> {
            throw new AssertionError("未提供种子不应读取随机数");
        });
        expectGeneration("txt2img", graph -> assertThat(inputs(graph, "5").path("seed").longValue()).isEqualTo(1L));
        expectGeneration("workflow", graph -> {
            assertThat(inputs(graph, "samplerA").path("seed").longValue()).isEqualTo(13L);
            assertThat(inputs(graph, "samplerB").path("seed").longValue()).isEqualTo(17L);
            assertThat(inputs(graph, "noise").path("noise_seed").longValue()).isEqualTo(19L);
        });

        provider.generate(request("txt2img", null, null, Map.of(), List.of()));
        generate(request("workflow", null, null, importedWorkflow(), List.of()));
    }

    @ParameterizedTest
    @ValueSource(longs = {-2L, Long.MIN_VALUE})
    void rejectsSeedsBelowCatalogMinimumWithoutQueuing(long seed) {
        assertThatThrownBy(() -> provider.generate(request("txt2img", seed, null, Map.of(), List.of())))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("种子必须为 -1 或非负整数");
        server.verify();
    }

    private Map<String, Object> importedWorkflow() {
        return Map.of(
                "samplerA", Map.of("class_type", "KSampler", "inputs", Map.of("seed", 13L)),
                "samplerB", Map.of("class_type", "KSampler", "inputs", Map.of("seed", 17L)),
                "noise", Map.of("class_type", "RandomNoise", "inputs", Map.of("noise_seed", 19L))
        );
    }

    private void assertImportedSeed(JsonNode graph, long seed) {
        assertThat(inputs(graph, "samplerA").path("seed").longValue()).isEqualTo(seed);
        assertThat(inputs(graph, "samplerB").path("seed").longValue()).isEqualTo(seed);
        assertThat(inputs(graph, "noise").path("noise_seed").longValue()).isEqualTo(seed);
    }

    private void generate(ImageGenerationRequest request) {
        ImageGenerationResponse response = provider.generate(request);
        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).base64Data()).isEqualTo("aW1hZ2U=");
        server.verify();
    }

    private ImageGenerationRequest request(String mode, Long seed, String vae, Map<String, Object> workflow,
                                           List<Map<String, Object>> loras) {
        return new ImageGenerationRequest(ImageProviderType.COMFYUI, mode, "cat", "", seed,
                30, 7.5, "euler", "normal", 512, 512, 1, 0.65, "base.safetensors", vae, loras,
                "img2img".equals(mode) ? "aW1hZ2U=" : null, "image/png", workflow, Map.of(), Duration.ofSeconds(1));
    }

    private JsonNode inputs(JsonNode graph, String nodeId) {
        return graph.path(nodeId).path("inputs");
    }

    private void expectGeneration(String mode, Consumer<JsonNode> graphAssertions) {
        if ("img2img".equals(mode)) {
            server.expect(requestTo("http://comfy/upload/image"))
                    .andExpect(method(POST))
                    .andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
                    .andRespond(withSuccess("{\"name\":\"source.png\"}", MediaType.APPLICATION_JSON));
        }
        server.expect(requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(httpRequest -> {
                    JsonNode payload = objectMapper.readTree(((MockClientHttpRequest) httpRequest).getBodyAsBytes());
                    graphAssertions.accept(payload.path("prompt"));
                })
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/queue"))
                .andExpect(method(GET))
                .andRespond(withSuccess("{\"queue_running\":[],\"queue_pending\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/history/abc"))
                .andExpect(method(GET))
                .andRespond(withSuccess("""
                        {"abc":{"outputs":{"out":{"images":[{"filename":"out.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/view?filename=out.png&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess("image", MediaType.IMAGE_PNG));
    }
}
