package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** 使用模拟 HTTP 验证 ComfyUI 结果契约；测试不会连接真实 ComfyUI 服务。 */
class ComfyUiProviderNonImageOutputTest {

    @Test
    void capturesOfficialAudioOutputUsingOnlyComfyViewAndKnownExtensionFallback() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "audio-1", """
                {"audio-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "12":{"audio":[{"filename":"voice.flac","subfolder":"clips","type":"output"}]}
                }}}
                """);
        server.expect(once(), requestTo("http://comfy/view?filename=voice.flac&subfolder=clips&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.APPLICATION_OCTET_STREAM));

        ImageGenerationResponse response = provider.generate(request("workflow"));

        assertThat(response.images()).isEmpty();
        assertThat(response.media()).hasSize(1);
        assertThat(response.media().get(0).fileName()).isEqualTo("voice.flac");
        assertThat(response.media().get(0).contentType()).isEqualTo("audio/flac");
        assertThat(response.media().get(0).base64Data()).isEqualTo(Base64.getEncoder().encodeToString(new byte[]{1, 2, 3}));
        assertThat(response.media().get(0).metadata()).containsEntry("outputKey", "audio");
        assertThat(response.metadata()).containsEntry("imageCount", 0).containsEntry("mediaCount", 1);
        Map<?, ?> comfyMetadata = (Map<?, ?>) response.metadata().get("comfyOutputMetadata");
        assertThat(comfyMetadata).containsEntry("terminalStatus", "success");
        server.verify();
    }

    @Test
    void classifiesImageKeyVideoOnlyByExplicitMediaMimeAndKeepsAnimationFlagAsMetadata() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "video-1", """
                {"video-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "3":{"images":[{"filename":"clip.mp4","subfolder":"","type":"output"}],"animated":[true]}
                }}}
                """);
        server.expect(once(), requestTo("http://comfy/view?filename=clip.mp4&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess(new byte[]{4, 5, 6}, MediaType.valueOf("video/mp4")));

        ImageGenerationResponse response = provider.generate(request("workflow"));

        assertThat(response.images()).isEmpty();
        assertThat(response.media()).hasSize(1);
        assertThat(response.media().get(0).contentType()).isEqualTo("video/mp4");
        Map<?, ?> comfyMetadata = (Map<?, ?>) response.metadata().get("comfyOutputMetadata");
        Map<?, ?> outputs = (Map<?, ?>) comfyMetadata.get("outputs");
        Map<?, ?> node = (Map<?, ?>) outputs.get("3");
        assertThat(node.get("animated")).isEqualTo(List.of(true));
        server.verify();
    }

    @Test
    void regularImageModeKeepsTypedVideoReferenceOnLegacyImagePath() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "legacy-video-1", """
                {"legacy-video-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "3":{"images":[{"filename":"clip.mp4","subfolder":"","type":"output"}]}
                }}}
                """);
        server.expect(once(), requestTo("http://comfy/view?filename=clip.mp4&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess(new byte[]{4, 5, 6}, MediaType.valueOf("video/mp4")));

        ImageGenerationResponse response = provider.generate(request("txt2img"));

        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).contentType()).isEqualTo("video/mp4");
        assertThat(response.media()).isEmpty();
        assertThat(response.metadata()).doesNotContainKeys("mediaCount", "comfyOutputMetadata");
        server.verify();
    }

    @Test
    void animatedPngRemainsAnImageEvenWhenComfyMarksItAnimated() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "animated-1", """
                {"animated-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "3":{"images":[{"filename":"motion.png","subfolder":"","type":"output"}],"animated":[true]}
                }}}
                """);
        server.expect(once(), requestTo("http://comfy/view?filename=motion.png&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess(new byte[]{7, 8, 9}, MediaType.IMAGE_PNG));

        ImageGenerationResponse response = provider.generate(request("workflow"));

        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).contentType()).isEqualTo("image/png");
        assertThat(response.media()).isEmpty();
        server.verify();
    }

    @Test
    void returnsBoundedTextMetadataOnlyForExplicitSuccessfulTerminalStatus() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "text-1", """
                {"text-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "17":{"text":["hello from ComfyUI"]}
                }}}
                """);

        ImageGenerationResponse response = provider.generate(request("workflow"));

        assertThat(response.images()).isEmpty();
        assertThat(response.media()).isEmpty();
        Map<?, ?> comfyMetadata = (Map<?, ?>) response.metadata().get("comfyOutputMetadata");
        Map<?, ?> outputs = (Map<?, ?>) comfyMetadata.get("outputs");
        assertThat((Map<?, ?>) outputs.get("17")).containsEntry("text", List.of("hello from ComfyUI"));
        server.verify();
    }

    @Test
    void regularImageModeStillFailsWhenSuccessfulHistoryContainsOnlyText() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "regular-text-1", """
                {"regular-text-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "17":{"text":["not a generated image"]}
                }}}
                """);

        assertThatThrownBy(() -> provider.generate(request("txt2img")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("COMFYUI:OUTPUT:workflow:EMPTY");
        server.verify();
    }

    @Test
    void regularImageModeDoesNotFetchCustomAudioOutputReferences() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "regular-audio-1", """
                {"regular-audio-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "12":{"audio":[{"filename":"voice.flac","subfolder":"","type":"output"}]}
                }}}
                """);

        assertThatThrownBy(() -> provider.generate(request("txt2img")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("COMFYUI:OUTPUT:workflow:EMPTY");
        server.verify();
    }

    @Test
    void retainsImageReferenceAfterMetadataNodeLimitAndLegacyMissingMimeFallback() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        StringBuilder outputs = new StringBuilder("{");
        for (int index = 0; index < 32; index++) {
            if (index > 0) outputs.append(',');
            outputs.append('"').append(index).append("\":{\"text\":[\"node\"]}");
        }
        outputs.append(",\"33\":{\"images\":[{\"filename\":\"late.png\",\"subfolder\":\"\",\"type\":\"output\"}]}}");
        String history = "{\"late-image\":{\"status\":{\"status_str\":\"success\",\"completed\":true},\"outputs\":"
                + outputs + "}}";
        expectQueueAndHistory(server, "late-image", history);
        server.expect(once(), requestTo("http://comfy/view?filename=late.png&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(withSuccess().body(new byte[]{9, 8, 7}));

        ImageGenerationResponse response = provider.generate(request("txt2img"));

        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).fileName()).isEqualTo("late.png");
        assertThat(response.images().get(0).contentType()).isEqualTo("image/png");
        assertThat(response.metadata()).containsEntry("imageCount", 1)
                .doesNotContainKeys("mediaCount", "comfyOutputMetadata");
        server.verify();
    }

    @Test
    void doesNotFetchUnsupportedAudioExtensionsAndDoesNotAcceptUnknownStatusAsSuccess() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "unsupported-1", """
                {"unsupported-1":{"status":{"status_str":"success","completed":true},"outputs":{
                  "5":{"audio":[{"filename":"voice.private","subfolder":"","type":"output"},
                                {"filename":"input.flac","subfolder":"","type":"input"}]}
                }}}
                """);

        ImageGenerationResponse response = provider.generate(request("workflow"));

        assertThat(response.media()).isEmpty();
        Map<?, ?> comfyMetadata = (Map<?, ?>) response.metadata().get("comfyOutputMetadata");
        assertThat(comfyMetadata.get("unsupportedMedia")).asList().hasSize(2);
        server.verify();

        RestClient.Builder noStatusBuilder = RestClient.builder();
        MockRestServiceServer noStatusServer = MockRestServiceServer.bindTo(noStatusBuilder).build();
        ComfyUiProvider noStatusProvider = provider(noStatusBuilder);
        expectQueueAndHistory(noStatusServer, "unknown-status", """
                {"unknown-status":{"outputs":{"5":{"text":["not terminal"]}}}}
                """);
        assertThatThrownBy(() -> noStatusProvider.generate(request()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("COMFYUI:OUTPUT:workflow:EMPTY");
        noStatusServer.verify();

        RestClient.Builder incompleteBuilder = RestClient.builder();
        MockRestServiceServer incompleteServer = MockRestServiceServer.bindTo(incompleteBuilder).build();
        ComfyUiProvider incompleteProvider = provider(incompleteBuilder);
        expectQueueAndHistory(incompleteServer, "incomplete-status", """
                {"incomplete-status":{"status":{"status_str":"success","completed":false},"outputs":{
                  "5":{"text":["not terminal"]}
                }}}
                """);
        assertThatThrownBy(() -> incompleteProvider.generate(request("workflow")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("COMFYUI:OUTPUT:workflow:EMPTY");
        incompleteServer.verify();
    }

    @Test
    void aKnownAudioReferenceDownloadFailureRemainsAProviderFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);
        expectQueueAndHistory(server, "missing-audio", """
                {"missing-audio":{"status":{"status_str":"success","completed":true},"outputs":{
                  "12":{"audio":[{"filename":"voice.mp3","subfolder":"","type":"output"}]}
                }}}
                """);
        server.expect(once(), requestTo("http://comfy/view?filename=voice.mp3&subfolder=&type=output"))
                .andExpect(method(GET))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound());

        assertThatThrownBy(() -> provider.generate(request("workflow")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("COMFYUI:DOWNLOAD:connectionId:HTTP");
        server.verify();
    }

    private void expectQueueAndHistory(MockRestServiceServer server, String promptId, String history) {
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andRespond(withSuccess("{\"prompt_id\":\"" + promptId + "\"}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/queue"))
                .andExpect(method(GET))
                .andRespond(withSuccess("{\"queue_running\":[],\"queue_pending\":[]}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/history/" + promptId))
                .andExpect(method(GET))
                .andRespond(withSuccess(history, MediaType.APPLICATION_JSON));
    }

    private ComfyUiProvider provider(RestClient.Builder builder) {
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        properties.getComfy().setMaxWait(Duration.ofSeconds(1));
        return new ComfyUiProvider(builder.baseUrl("http://comfy").build(), properties);
    }

    private ImageGenerationRequest request() {
        return request("txt2img");
    }

    private ImageGenerationRequest request(String mode) {
        Map<String, Object> workflow = "workflow".equals(mode)
                ? Map.of("1", Map.of("class_type", "TestNode", "inputs", Map.of()))
                : null;
        return new ImageGenerationRequest(ImageProviderType.COMFYUI, mode, "cat", "", 1L,
                20, 7.0, "euler", "normal", 512, 512, 1, 1.0,
                "model.safetensors", null, List.of(), null, null, workflow, Map.of(), Duration.ofSeconds(1));
    }
}
