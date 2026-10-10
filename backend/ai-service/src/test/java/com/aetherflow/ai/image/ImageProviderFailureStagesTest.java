package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ImageProviderFailureStagesTest {

    private static final String SECRET = "SECRET http://user:password@private/model?token=credential stacktrace";

    @ParameterizedTest
    @CsvSource({
            "UPLOAD,HTTP", "QUEUE,HTTP", "POLL,HTTP", "DOWNLOAD,HTTP",
            "UPLOAD,UNREACHABLE", "QUEUE,UNREACHABLE", "POLL,UNREACHABLE", "DOWNLOAD,UNREACHABLE",
            "UPLOAD,TIMEOUT", "QUEUE,TIMEOUT", "POLL,TIMEOUT", "DOWNLOAD,TIMEOUT"
    })
    void comfyTransportFailuresKeepActualStageAndNeverLeakResponse(String stage, String reason) {
        Fixture fixture = comfy(Duration.ZERO);
        String mode = "UPLOAD".equals(stage) ? "img2img" : "txt2img";
        if ("UPLOAD".equals(stage)) {
            fixture.server.expect(requestTo("http://provider/upload/image")).andRespond(transportFailure(reason));
        } else if ("QUEUE".equals(stage)) {
            fixture.server.expect(requestTo("http://provider/prompt")).andRespond(transportFailure(reason));
        } else {
            queued(fixture);
            if ("POLL".equals(stage)) {
                fixture.server.expect(requestTo("http://provider/queue")).andRespond(transportFailure(reason));
            } else {
                polled(fixture, successHistory());
                fixture.server.expect(requestTo("http://provider/view?filename=out.png&subfolder=&type=output"))
                        .andRespond(transportFailure(reason));
            }
        }

        String field = "TIMEOUT".equals(reason) ? "timeoutSeconds" : "connectionId";
        BusinessException failure = assertFailure(() -> fixture.provider.generate(request(mode, "aW1n")),
                "COMFYUI:" + stage + ":" + field + ":" + reason);
        if ("TIMEOUT".equals(reason)) {
            assertThat(failure).hasMessageContaining("原任务可能仍在服务端运行");
        }
        fixture.server.verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 400})
    void explicitQueueErrorRejectsBeforePollingEvenWithPromptId(int status) {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/prompt"))
                .andRespond(withStatus(HttpStatus.valueOf(status)).contentType(MediaType.APPLICATION_JSON).body("""
                        {"prompt_id":"abc", "error":{"message":"%s"},
                         "node_errors":{"42":{"class_type":"KSampler","errors":[
                           {"message":"%s", "details":"%s", "extra_info":{"input_name":"scheduler"}}
                         ]}}}
                        """.formatted(SECRET, SECRET, SECRET)));

        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:QUEUE:scheduler:REJECTED");
        fixture.server.verify();
    }

    @Test
    void acceptedPromptWithPartialNodeErrorsContinuesWithoutDuplicateSubmission() {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/prompt"))
                .andRespond(withSuccess("""
                        {"prompt_id":"abc","node_errors":{"9":{"class_type":"UnknownCustomNode",
                        "errors":[{"message":"%s"}]}}}
                        """.formatted(SECRET), MediaType.APPLICATION_JSON));
        polled(fixture, successHistory());
        fixture.server.expect(requestTo("http://provider/view?filename=out.png&subfolder=&type=output"))
                .andRespond(withSuccess("image".getBytes(), MediaType.IMAGE_PNG));

        assertThat(fixture.provider.generate(request("txt2img", null)).images()).hasSize(1);
        fixture.server.verify();
    }

    @ParameterizedTest
    @CsvSource({"ckpt_name,checkpoint", "sampler_name,sampler", "vae_name,vae", "lora_name,lora",
            "upscale_method,upscaler", "image,sourceImage", "seed,seed", "unknown,workflow"})
    void queueValidationOnlyUsesAllowedFieldNames(String inputName, String field) {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/prompt"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON).body("""
                        {"node_errors":{"1":{"class_type":"UnknownCustomNode","errors":[
                           {"extra_info":{"input_name":"%s"},"message":"%s"}
                        ]}}}
                        """.formatted(inputName, SECRET)));

        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:QUEUE:" + field + ":REJECTED");
        fixture.server.verify();
    }

    @Test
    void queueFallsBackToKnownClassWithoutEchoingCustomClassNames() {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/prompt"))
                .andRespond(withSuccess("""
                        {"node_errors":{"1":{"class_type":"CheckpointLoaderSimple","errors":[]}}}
                        """, MediaType.APPLICATION_JSON));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:QUEUE:checkpoint:REJECTED");
        fixture.server.verify();
    }

    @ParameterizedTest
    @CsvSource({"execution_error,VAELoader,vae,FAILED", "execution_error,LoraLoader,lora,FAILED",
            "execution_error,UnknownCustomNode,workflow,FAILED", "execution_interrupted,KSampler,workflow,INTERRUPTED"})
    void historyExecutionFailuresAreNotMistakenForEmptyOutputs(String event, String nodeType, String field, String reason) {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        polled(fixture, """
                {"abc":{"outputs":{},"status":{"status_str":"error","completed":false,"messages":[
                    ["execution_start",{}],
                    ["%s",{"node_type":"%s","exception_message":"%s","traceback":["%s"],
                    "current_inputs":{"prompt":"%s"}}]
                ]}}}
                """.formatted(event, nodeType, SECRET, SECRET, SECRET));

        BusinessException failure = assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:GENERATION:" + field + ":" + reason);
        if ("INTERRUPTED".equals(reason)) {
            assertThat(failure).hasMessageContaining("原任务可能仍在服务端运行");
        }
        fixture.server.verify();
    }

    @Test
    void historyErrorStatusWithoutMessagesStillReportsGenerationFailure() {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        polled(fixture, "{\"abc\":{\"outputs\":{},\"status\":{\"status_str\":\"error\"}}}");
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:GENERATION:workflow:FAILED");
        fixture.server.verify();
    }

    @Test
    void pollingHistoryHttpFailureIsPollStage() {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        fixture.server.expect(requestTo("http://provider/queue"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        fixture.server.expect(requestTo("http://provider/history/abc")).andRespond(transportFailure("HTTP"));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)), "COMFYUI:POLL:connectionId:HTTP");
        fixture.server.verify();
    }

    @Test
    void pollingDeadlineWarnsBeforeRetryAndDoesNotCancelRemoteTask() {
        Fixture fixture = comfy(Duration.ofMillis(250));
        queued(fixture);
        polled(fixture, "{}");
        BusinessException failure = assertFailure(() -> fixture.provider.generate(request("txt2img", null,
                Duration.ofMillis(200))), "COMFYUI:POLL:timeoutSeconds:TIMEOUT");
        assertThat(failure).hasMessageContaining("原任务可能仍在服务端运行");
        fixture.server.verify();
    }

    @Test
    void pollingInterruptionPreservesInterruptFlagAndDoesNotCancelRemoteTask() {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        try {
            Thread.currentThread().interrupt();
            BusinessException failure = assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                    "COMFYUI:POLL:workflow:INTERRUPTED");
            assertThat(failure).hasMessageContaining("原任务可能仍在服务端运行");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            fixture.server.verify();
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    void invalidSourceImageFailsInputBeforeUpload() {
        Fixture fixture = comfy(Duration.ZERO);
        assertFailure(() -> fixture.provider.upscale(request("upscale", SECRET)),
                "COMFYUI:INPUT:sourceImage:VALIDATION");
        fixture.server.verify();
    }

    @Test
    void uploadWithoutNameHasUploadResponseFailure() {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/upload/image"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertFailure(() -> fixture.provider.upscale(request("upscale", "aW1n")),
                "COMFYUI:UPLOAD:sourceImage:INVALID_RESPONSE");
        fixture.server.verify();
    }

    @ParameterizedTest
    @CsvSource({"image/png,image/png,source.png", "image/jpeg,image/jpeg,source.jpg",
            "image/webp,image/webp,source.webp", "text/html,image/png,source.png"})
    void uploadedImageUsesAllowlistedMimeAndMatchingDefaultFilename(String inputMime, String expectedMime,
                                                                   String filename) {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/upload/image"))
                .andExpect(content().string(containsString("Content-Type: " + expectedMime)))
                .andExpect(content().string(containsString("filename=\"" + filename + "\"")))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        ImageGenerationRequest request = request("upscale", "aW1n", Duration.ofSeconds(2), inputMime, Map.of());
        assertFailure(() -> fixture.provider.upscale(request), "COMFYUI:UPLOAD:sourceImage:INVALID_RESPONSE");
        fixture.server.verify();
    }

    @Test
    void uploadedImagePreservesExplicitSourceFilename() {
        Fixture fixture = comfy(Duration.ZERO);
        fixture.server.expect(requestTo("http://provider/upload/image"))
                .andExpect(content().string(containsString("Content-Type: image/webp")))
                .andExpect(content().string(containsString("filename=\"custom-input.webp\"")))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        ImageGenerationRequest request = request("upscale", "aW1n", Duration.ofSeconds(2), "image/webp",
                Map.of("sourceImageName", "custom-input.webp"));
        assertFailure(() -> fixture.provider.upscale(request), "COMFYUI:UPLOAD:sourceImage:INVALID_RESPONSE");
        fixture.server.verify();
    }

    @Test
    void emptyDownloadedBytesHaveDownloadStage() {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        polled(fixture, successHistory());
        fixture.server.expect(requestTo("http://provider/view?filename=out.png&subfolder=&type=output"))
                .andRespond(withSuccess(new byte[0], MediaType.IMAGE_PNG));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)), "COMFYUI:DOWNLOAD:workflow:EMPTY");
        fixture.server.verify();
    }

    @Test
    void invalidDownloadContentTypeCannotLeakRawHeader() {
        Fixture fixture = comfy(Duration.ZERO);
        queued(fixture);
        polled(fixture, successHistory());
        fixture.server.expect(requestTo("http://provider/view?filename=out.png&subfolder=&type=output"))
                .andRespond(withSuccess().body("image").header("Content-Type", "SECRET"));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "COMFYUI:DOWNLOAD:workflow:INVALID_RESPONSE");
        fixture.server.verify();
    }

    @ParameterizedTest
    @CsvSource({"txt2img,HTTP", "txt2img,TIMEOUT", "txt2img,UNREACHABLE",
            "upscale,HTTP", "upscale,TIMEOUT", "upscale,UNREACHABLE"})
    void sdTransportFailuresAreSafeForBothGenerateAndUpscale(String mode, String reason) {
        Fixture fixture = sd();
        fixture.server.expect(requestTo("http://provider/sdapi/v1/" +
                        ("upscale".equals(mode) ? "extra-single-image" : mode)))
                .andRespond(transportFailure(reason));
        String field = "TIMEOUT".equals(reason) ? "timeoutSeconds" : "connectionId";
        BusinessException failure = assertFailure(() -> {
            if ("upscale".equals(mode)) {
                fixture.provider.upscale(request(mode, "aW1n"));
            } else {
                fixture.provider.generate(request(mode, null));
            }
        }, "SD_WEBUI:REQUEST:" + field + ":" + reason);
        if ("TIMEOUT".equals(reason)) {
            assertThat(failure).hasMessageContaining("原任务可能仍在服务端运行");
        }
        fixture.server.verify();
    }

    @ParameterizedTest
    @CsvSource({"400,sd_model_checkpoint,checkpoint", "422,sampler_name,sampler", "422,sd_vae,vae",
            "422,init_images,sourceImage", "422,upscaler_1,upscaler", "422,unknown,workflow"})
    void sdRequestValidationMapsOnlyStructuredAllowedLocations(int status, String name, String field) {
        Fixture fixture = sd();
        fixture.server.expect(requestTo("http://provider/sdapi/v1/txt2img"))
                .andRespond(withStatus(HttpStatus.valueOf(status)).contentType(MediaType.APPLICATION_JSON).body("""
                        {"detail":[{"loc":["body","override_settings","%s"],"msg":"%s","input":"%s"}]}
                        """.formatted(name, SECRET, SECRET)));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "SD_WEBUI:REQUEST:" + field + ":VALIDATION");
        fixture.server.verify();
    }

    @Test
    void rawServerHtmlCannotInfluenceFieldClassificationOrLeak() {
        Fixture fixture = sd();
        fixture.server.expect(requestTo("http://provider/sdapi/v1/txt2img"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_HTML)
                        .body("<html>sampler checkpoint " + SECRET + "</html>"));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "SD_WEBUI:REQUEST:workflow:VALIDATION");
        fixture.server.verify();
    }

    @Test
    void malformedSuccessResponseNeverLeaksBodyOrParserException() {
        Fixture fixture = sd();
        fixture.server.expect(requestTo("http://provider/sdapi/v1/txt2img"))
                .andRespond(withSuccess(SECRET, MediaType.APPLICATION_JSON));
        assertFailure(() -> fixture.provider.generate(request("txt2img", null)),
                "SD_WEBUI:REQUEST:workflow:INVALID_RESPONSE");
        fixture.server.verify();
    }

    private BusinessException assertFailure(Runnable action, String token) {
        Throwable failure = catchThrowable(action::run);
        assertThat(failure).isInstanceOf(BusinessException.class).hasNoCause()
                .hasMessageStartingWith("[IMAGE_EXECUTION:" + token + "]")
                .hasMessageNotContaining("SECRET").hasMessageNotContaining("http://")
                .hasMessageNotContaining("password").hasMessageNotContaining("credential")
                .hasMessageNotContaining("stacktrace");
        return (BusinessException) failure;
    }

    private ResponseCreator transportFailure(String reason) {
        return switch (reason) {
            case "TIMEOUT" -> request -> { throw new SocketTimeoutException(SECRET); };
            case "UNREACHABLE" -> request -> { throw new ConnectException(SECRET); };
            default -> withStatus(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.TEXT_HTML).body(SECRET);
        };
    }

    private Fixture comfy(Duration pollInterval) {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://provider");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setPollInterval(pollInterval);
        return new Fixture(server, new ComfyUiProvider(builder.build(), properties));
    }

    private Fixture sd() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://provider");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(server, new StableDiffusionWebUiProvider(builder.build(), new ImageProviderProperties()));
    }

    private void queued(Fixture fixture) {
        fixture.server.expect(requestTo("http://provider/prompt"))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
    }

    private void polled(Fixture fixture, String history) {
        fixture.server.expect(requestTo("http://provider/queue"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        fixture.server.expect(requestTo("http://provider/history/abc"))
                .andRespond(withSuccess(history, MediaType.APPLICATION_JSON));
    }

    private String successHistory() {
        return "{\"abc\":{\"outputs\":{\"7\":{\"images\":[{\"filename\":\"out.png\"}]}}}}";
    }

    private ImageGenerationRequest request(String mode, String source) {
        return request(mode, source, Duration.ofSeconds(2));
    }

    private ImageGenerationRequest request(String mode, String source, Duration timeout) {
        return request(mode, source, timeout, "image/png", Map.of());
    }

    private ImageGenerationRequest request(String mode, String source, Duration timeout, String contentType,
                                           Map<String, Object> options) {
        return new ImageGenerationRequest(ImageProviderType.COMFYUI, mode, SECRET, "", null, null,
                null, null, null, null, null, null, null, null, null, List.of(), source,
                contentType, Map.of(), options, timeout);
    }

    private record Fixture(MockRestServiceServer server, ImageGenerationProvider provider) { }
}
