package com.aetherflow.ai.connection;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** API 执行图探测必须按图里的实际节点类型给出能力，不能固定只报 IMAGE_GENERATION。 */
class ImageConnectionDiscoveryWorkflowTest {

    private final NodeConnectionProfile profile =
            new NodeConnectionProfile("saved", "已有连接", "COMFYUI", "http://fake-comfy", false);

    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private ImageConnectionDiscovery discovery;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        discovery = new ImageConnectionDiscovery((baseUrl, timeout) -> builder.baseUrl(baseUrl).build(),
                Duration.ofSeconds(2));
    }

    @Test
    void upscaleGraphReportsUpscaleCapability() {
        expectObjectInfo();

        NodeConnectionProbe probe = discovery.probeWorkflow(profile,
                List.of("LoadImage", "ImageScaleBy", "SaveImage"));

        assertThat(probe.status()).isEqualTo("usable");
        assertThat(probe.capabilities()).contains("UPSCALE");
        server.verify();
    }

    @Test
    void generationGraphStillReportsImageGenerationCapability() {
        expectObjectInfo();

        NodeConnectionProbe probe = discovery.probeWorkflow(profile,
                List.of("CheckpointLoaderSimple", "KSampler", "SaveImage"));

        assertThat(probe.status()).isEqualTo("usable");
        assertThat(probe.capabilities()).contains("IMAGE_GENERATION");
        server.verify();
    }

    private void expectObjectInfo() {
        server.expect(once(), requestTo("http://fake-comfy/object_info"))
                .andExpect(method(GET))
                .andRespond(withSuccess("""
                        {
                          "CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [["base.safetensors"]]}}},
                          "VAELoader": {"input": {"required": {"vae_name": [["ae.safetensors"]]}}},
                          "LoraLoader": {"input": {"required": {"lora_name": [["style.safetensors"]]}}},
                          "KSampler": {"input": {"required": {"sampler_name": [["euler"]], "scheduler": [["normal"]]}}},
                          "ImageScaleBy": {"input": {"required": {"upscale_method": [["nearest-exact", "bilinear"]]}}},
                          "LoadImage": {"input": {"required": {"image": [["source.png"]]}}},
                          "CLIPTextEncode": {"input": {"required": {}}},
                          "EmptyLatentImage": {"input": {"required": {}}},
                          "VAEDecode": {"input": {"required": {}}},
                          "SaveImage": {"input": {"required": {}}}
                        }
                        """, MediaType.APPLICATION_JSON));
    }
}
