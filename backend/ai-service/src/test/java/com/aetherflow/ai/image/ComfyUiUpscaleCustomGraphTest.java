package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * UPSCALE 节点的显式 ComfyUI 执行图必须真的被执行，
 * 不能静默换成默认放大图。
 */
class ComfyUiUpscaleCustomGraphTest {

    private static final Map<String, Object> CUSTOM_GRAPH = Map.of(
            "1", Map.of("class_type", "LoadImage", "inputs", Map.of("image", "placeholder.png")),
            "2", Map.of("class_type", "ImageScaleBy", "inputs", Map.of(
                    "image", List.of("1", 0), "upscale_method", "nearest-exact", "scale_by", 3)),
            "3", Map.of("class_type", "SaveImage", "inputs", Map.of("images", List.of("2", 0))));

    private static final Map<String, Object> SOURCE_IMAGE_BINDING = Map.of(
            "nodeId", "1", "inputName", "image", "parameter", "sourceImage");

    private static final Map<String, Object> PLUGIN_GRAPH = Map.of(
            "1", Map.of("class_type", "LoadImage", "inputs", Map.of("image", "placeholder.png")),
            "2", Map.of("class_type", "AcmeSuperResolution", "inputs", Map.of("image", List.of("1", 0))),
            "3", Map.of("class_type", "SaveImage", "inputs", Map.of("images", List.of("2", 0))));

    @Test
    void customExecutionGraphIsSubmittedInsteadOfTheDefaultGraph() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().string(containsString("nearest-exact")))
                .andExpect(content().string(containsString("uploaded-source.png")))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        server.expect(once(), requestTo("http://comfy/history/abc"))
                .andRespond(withSuccess("""
                        {"abc":{"outputs":{"3":{"images":[{"filename":"upscaled.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/view?filename=upscaled.png&subfolder=&type=output"))
                .andRespond(withSuccess("aW1hZ2U=", MediaType.IMAGE_PNG));

        ImageGenerationResponse response = provider.upscale(request(CUSTOM_GRAPH, Map.of(
                "workflowBindings", List.of(SOURCE_IMAGE_BINDING))));

        assertThat(response.images()).hasSize(1);
        server.verify();
    }

    @Test
    void unknownPluginUpscaleGraphWithSourceBindingExecutesWithoutBuiltInUpscalerName() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().string(containsString("AcmeSuperResolution")))
                .andExpect(content().string(containsString("uploaded-source.png")))
                .andRespond(withSuccess("{\"prompt_id\":\"plugin\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        server.expect(once(), requestTo("http://comfy/history/plugin"))
                .andRespond(withSuccess("""
                        {"plugin":{"outputs":{"3":{"images":[{"filename":"plugin-upscaled.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/view?filename=plugin-upscaled.png&subfolder=&type=output"))
                .andRespond(withSuccess("aW1hZ2U=", MediaType.IMAGE_PNG));

        ImageGenerationResponse response = provider.upscale(request(PLUGIN_GRAPH, Map.of(
                "workflowBindings", List.of(SOURCE_IMAGE_BINDING))));

        assertThat(response.images()).hasSize(1);
        server.verify();
    }

    @Test
    void noExecutionGraphKeepsTheDefaultUpscaleGraph() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().string(containsString("ImageScaleBy")))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        server.expect(once(), requestTo("http://comfy/history/abc"))
                .andRespond(withSuccess("""
                        {"abc":{"outputs":{"3":{"images":[{"filename":"upscaled.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/view?filename=upscaled.png&subfolder=&type=output"))
                .andRespond(withSuccess("aW1hZ2U=", MediaType.IMAGE_PNG));

        ImageGenerationResponse response = provider.upscale(request(null, Map.of()));

        assertThat(response.images()).hasSize(1);
        server.verify();
    }

    @Test
    void customGraphWithoutSourceImageBindingFailsExplicitly() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.upscale(request(CUSTOM_GRAPH, Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("sourceImage");
    }

    @Test
    void invalidExecutionGraphFailsExplicitly() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.upscale(request(Map.of("1", Map.of("class_type", "Weird")), Map.of())))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception -> assertThat(((BusinessException) exception).getErrorCode())
                        .isEqualTo(ResultCode.BAD_REQUEST));
    }

    private static ImageGenerationRequest request(Map<String, Object> workflowJson, Map<String, Object> options) {
        return new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "upscale",
                "",
                "",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(),
                "c291cmNlLWltYWdl",
                "image/png",
                workflowJson,
                options,
                Duration.ofSeconds(1)
        );
    }

    private static void expectQueue(MockRestServiceServer server) {
        server.expect(once(), requestTo("http://comfy/queue"))
                .andRespond(withSuccess("{\"queue_running\":[],\"queue_pending\":[]}", MediaType.APPLICATION_JSON));
    }

    private static ComfyUiProvider provider(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("http://comfy").build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        properties.getComfy().setMaxWait(Duration.ofSeconds(1));
        return new ComfyUiProvider(restClient, properties);
    }

    private static org.springframework.test.web.client.ExpectedCount once() {
        return org.springframework.test.web.client.ExpectedCount.once();
    }
}
