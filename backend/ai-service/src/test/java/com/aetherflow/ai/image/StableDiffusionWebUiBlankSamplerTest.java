package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.POST;

/**
 * 可选枚举的空白值统一表示"未指定"：载荷里不出现空采样器与空调度器，
 * 由服务自身使用默认配置。
 */
class StableDiffusionWebUiBlankSamplerTest {

    @Test
    void blankSamplerAndSchedulerAreOmittedSoTheServiceDefaultApplies() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        StableDiffusionWebUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://sd/sdapi/v1/txt2img"))
                .andExpect(method(POST))
                .andExpect(content().string(not(containsString("sampler_name"))))
                .andExpect(content().string(not(containsString("scheduler"))))
                .andRespond(withSuccess("""
                        {"images": ["aW1hZ2UtYnl0ZXM="], "parameters": {"seed": 123}, "info": "{}"}
                        """, MediaType.APPLICATION_JSON));

        provider.generate(request(" ", ""));

        server.verify();
    }

    @Test
    void explicitSamplerAndSchedulerAreStillSent() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        StableDiffusionWebUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://sd/sdapi/v1/txt2img"))
                .andExpect(method(POST))
                .andExpect(content().string(containsString("\"sampler_name\":\"DPM++ 2M\"")))
                .andExpect(content().string(containsString("\"scheduler\":\"karras\"")))
                .andRespond(withSuccess("""
                        {"images": ["aW1hZ2UtYnl0ZXM="], "parameters": {"seed": 123}, "info": "{}"}
                        """, MediaType.APPLICATION_JSON));

        provider.generate(request("DPM++ 2M", "karras"));

        server.verify();
    }

    private static StableDiffusionWebUiProvider provider(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("http://sd").build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getStableDiffusion().setBaseUrl("http://sd");
        return new StableDiffusionWebUiProvider(restClient, properties);
    }

    private static ImageGenerationRequest request(String sampler, String scheduler) {
        return new ImageGenerationRequest(
                ImageProviderType.STABLE_DIFFUSION_WEBUI,
                "txt2img",
                "cat",
                "blur",
                null,
                25,
                7.5,
                sampler,
                scheduler,
                1024,
                768,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                Duration.ofMillis(10)
        );
    }
}
