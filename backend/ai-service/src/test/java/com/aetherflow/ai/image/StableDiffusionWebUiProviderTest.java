package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.POST;

class StableDiffusionWebUiProviderTest {

    @Test
    void mapsTxt2imgRequestAndResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.baseUrl("http://sd").build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getStableDiffusion().setBaseUrl("http://sd");
        StableDiffusionWebUiProvider provider = new StableDiffusionWebUiProvider(restClient, properties);

        server.expect(once(), requestTo("http://sd/sdapi/v1/txt2img"))
                .andExpect(method(POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "prompt": "cat <lora:detail:0.8>",
                          "negative_prompt": "blur",
                          "steps": 25,
                          "cfg_scale": 7.5,
                          "width": 1024,
                          "height": 768
                        }
                        """))
                .andRespond(withSuccess("""
                        {
                          "images": ["aW1hZ2UtYnl0ZXM="],
                          "parameters": {"seed": 123},
                          "info": "{}"
                        }
                        """, MediaType.APPLICATION_JSON));

        ImageGenerationRequest request = new ImageGenerationRequest(
                ImageProviderType.STABLE_DIFFUSION_WEBUI,
                "txt2img",
                "cat",
                "blur",
                null,
                25,
                7.5,
                null,
                null,
                1024,
                768,
                null,
                null,
                null,
                null,
                List.of(Map.of("name", "detail", "weight", 0.8)),
                null,
                null,
                null,
                null,
                null
        );

        ImageGenerationResponse response = provider.generate(request);

        assertThat(response.provider()).isEqualTo("STABLE_DIFFUSION_WEBUI");
        assertThat(response.mode()).isEqualTo("txt2img");
        assertThat(response.images()).hasSize(1);
        GeneratedImagePayload image = response.images().get(0);
        assertThat(image.contentType()).isEqualTo("image/png");
        assertThat(image.base64Data()).isEqualTo("aW1hZ2UtYnl0ZXM=");
        assertThat(image.fileName()).isEqualTo("sd-webui-1.png");
        assertThat(image.metadata()).containsEntry("index", 0);
        assertThat(response.metadata())
                .containsEntry("parameters", Map.of("seed", 123))
                .containsEntry("info", "{}");
        server.verify();
    }
}
