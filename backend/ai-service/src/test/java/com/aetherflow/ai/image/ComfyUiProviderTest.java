package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ComfyUiProviderTest {

    private HttpServer httpServer;

    @AfterEach
    void stopHttpServer() {
        if (httpServer != null) {
            httpServer.stop(0);
            httpServer = null;
        }
    }

    @Test
    void queuesWorkflowPollsQueueReadsHistoryAndDownloadsImages() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "prompt": {
                            "1": {
                              "class_type": "CheckpointLoaderSimple",
                              "inputs": {"ckpt_name": "sdxl.safetensors"}
                            },
                            "5": {
                              "class_type": "KSampler",
                              "inputs": {
                                "seed": 7,
                                "steps": 20,
                                "cfg": 6.5,
                                "sampler_name": "euler",
                                "scheduler": "normal",
                                "denoise": 0.45,
                                "model": ["8", 0]
                              }
                            },
                            "6": {
                              "class_type": "VAEDecode",
                              "inputs": {"vae": ["9", 0]}
                            },
                            "7": {
                              "class_type": "SaveImage"
                            },
                            "8": {
                              "class_type": "LoraLoader",
                              "inputs": {
                                "lora_name": "style.safetensors",
                                "strength_model": 0.7,
                                "strength_clip": 0.7
                              }
                            },
                            "9": {
                              "class_type": "VAELoader",
                              "inputs": {"vae_name": "ae.safetensors"}
                            }
                          }
                        }
                        """))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        expectHistory(server, "abc", "out.png", "", "output");
        expectView(server, "out.png", "", "output");

        ImageGenerationResponse response = provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "txt2img",
                "cat",
                "blur",
                7L,
                20,
                6.5,
                "euler",
                "normal",
                768,
                1024,
                2,
                0.45,
                "sdxl.safetensors",
                "ae.safetensors",
                List.of(Map.of("name", "style.safetensors", "weight", 0.7)),
                null,
                null,
                null,
                null,
                Duration.ofSeconds(1)
        ));

        assertThat(response.provider()).isEqualTo("COMFYUI");
        assertThat(response.mode()).isEqualTo("txt2img");
        assertThat(response.images()).hasSize(1);
        GeneratedImagePayload image = response.images().get(0);
        assertThat(image.fileName()).isEqualTo("out.png");
        assertThat(image.contentType()).isEqualTo("image/png");
        assertThat(image.base64Data()).isEqualTo("aW1hZ2UtYnl0ZXM=");
        assertThat(image.size()).isEqualTo(11L);
        assertThat(response.metadata())
                .containsEntry("promptId", "abc")
                .containsEntry("imageCount", 1);
        server.verify();
    }

    @Test
    void buildsImg2imgWorkflowWithSourceImageAndNormalizedMode() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
                .andExpect(content().string(containsString("source-image")))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().json("""
                        {
                          "prompt": {
                            "4": {
                              "class_type": "LoadImage",
                              "inputs": {"image": "uploaded-source.png"}
                            },
                            "5": {
                              "class_type": "VAEEncode",
                              "inputs": {"pixels": ["4", 0]}
                            },
                            "6": {
                              "class_type": "KSampler",
                              "inputs": {
                                "denoise": 0.35,
                                "latent_image": ["5", 0]
                              }
                            }
                          },
                          "client_id": "aetherflow"
                        }
                        """))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        expectHistory(server, "abc", "out.png", "", "output");
        expectView(server, "out.png", "", "output");

        ImageGenerationResponse response = provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                " img2img ",
                "cat",
                "blur",
                7L,
                20,
                6.5,
                "euler",
                "normal",
                768,
                1024,
                2,
                0.35,
                "sdxl.safetensors",
                null,
                List.of(),
                "c291cmNlLWltYWdl",
                "image/png",
                null,
                null,
                Duration.ofSeconds(1)
        ));

        assertThat(response.mode()).isEqualTo("img2img");
        server.verify();
    }

    @Test
    void rejectsImg2imgWithoutSourceImage() {
        ComfyUiProvider provider = provider(RestClient.builder());

        assertThatThrownBy(() -> provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "img2img",
                "cat",
                "blur",
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
                "",
                "image/png",
                null,
                null,
                Duration.ofSeconds(1)
        )))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("img2img source image is required");
    }

    @Test
    void rejectsImg2imgNullSourceImage() {
        ComfyUiProvider provider = provider(RestClient.builder());

        assertThatThrownBy(() -> provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "img2img",
                "cat",
                "blur",
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
                null,
                "image/png",
                null,
                null,
                Duration.ofSeconds(1)
        )))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("img2img source image is required");
    }

    @Test
    void rejectsUnsupportedMode() {
        ComfyUiProvider provider = provider(RestClient.builder());

        assertThatThrownBy(() -> provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "inpaint",
                "cat",
                "blur",
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
                null,
                null,
                null,
                null,
                Duration.ofSeconds(1)
        )))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("unsupported comfyui mode");
    }

    @Test
    void appliesFluxWorkflowParametersAndMultipleLoras() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().json("""
                        {
                          "prompt": {
                            "1": {
                              "class_type": "UNETLoader",
                              "inputs": {"unet_name": "flux-dev.safetensors"}
                            },
                            "2": {
                              "class_type": "EmptySD3LatentImage",
                              "inputs": {
                                "width": 1216,
                                "height": 832,
                                "batch_size": 4
                              }
                            },
                            "3": {
                              "class_type": "RandomNoise",
                              "inputs": {"noise_seed": 42}
                            },
                            "4": {
                              "class_type": "BasicScheduler",
                              "inputs": {
                                "steps": 28,
                                "scheduler": "sgm_uniform",
                                "denoise": 0.8
                              }
                            },
                            "5": {
                              "class_type": "CFGGuider",
                              "inputs": {"cfg": 3.5}
                            },
                            "6": {
                              "class_type": "KSamplerSelect",
                              "inputs": {"sampler_name": "euler"}
                            },
                            "7": {
                              "class_type": "LoraLoader",
                              "inputs": {
                                "lora_name": "style.safetensors",
                                "strength_model": 0.7,
                                "strength_clip": 0.7
                              }
                            },
                            "8": {
                              "class_type": "LoraLoader",
                              "inputs": {
                                "lora_name": "detail.safetensors",
                                "strength_model": 0.4,
                                "strength_clip": 0.4
                              }
                            }
                          }
                        }
                        """))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        expectHistory(server, "abc", "out.png", "", "output");
        expectView(server, "out.png", "", "output");

        provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "workflow",
                "cat",
                "blur",
                42L,
                28,
                3.5,
                "euler",
                "sgm_uniform",
                1216,
                832,
                4,
                0.8,
                "flux-dev.safetensors",
                null,
                List.of(
                        Map.of("name", " ", "weight", 0.2),
                        Map.of("name", "style.safetensors", "weight", 0.7),
                        Map.of("name", "detail.safetensors", "weight", 0.4)
                ),
                null,
                null,
                fluxWorkflowJson(),
                null,
                Duration.ofSeconds(1)
        ));

        server.verify();
    }

    @Test
    void appliesParametersToImportedWorkflowJson() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().json("""
                        {
                          "prompt": {
                            "1": {
                              "class_type": "CLIPTextEncode",
                              "inputs": {"text": "cat"}
                            },
                            "2": {
                              "class_type": "CLIPTextEncode",
                              "inputs": {"text": "blur"}
                            },
                            "3": {
                              "class_type": "KSampler",
                              "inputs": {
                                "seed": 11,
                                "steps": 30,
                                "cfg": 7.5,
                                "sampler_name": "dpmpp_2m",
                                "scheduler": "karras",
                                "denoise": 0.35
                              }
                            },
                            "4": {
                              "class_type": "EmptyLatentImage",
                              "inputs": {
                                "width": 1024,
                                "height": 768,
                                "batch_size": 3
                              }
                            },
                            "5": {
                              "class_type": "CheckpointLoaderSimple",
                              "inputs": {"ckpt_name": "flux-dev.safetensors"}
                            },
                            "6": {
                              "class_type": "VAELoader",
                              "inputs": {"vae_name": "ae.safetensors"}
                            },
                            "7": {
                              "class_type": "LoraLoader",
                              "inputs": {
                                "lora_name": "product.safetensors",
                                "strength_model": 0.8,
                                "strength_clip": 0.8
                              }
                            }
                          }
                        }
                        """))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        expectHistory(server, "abc", "out.png", "", "output");
        expectView(server, "out.png", "", "output");

        provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "workflow",
                "cat",
                "blur",
                11L,
                30,
                7.5,
                "dpmpp_2m",
                "karras",
                1024,
                768,
                3,
                0.35,
                "flux-dev.safetensors",
                "ae.safetensors",
                List.of(Map.of("name", "product.safetensors", "weight", 0.8)),
                null,
                null,
                workflowJson(),
                null,
                Duration.ofSeconds(1)
        ));

        server.verify();
    }

    @Test
    void rejectsQueueWithoutPromptId() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.generate(txt2imgRequest(Duration.ofSeconds(1))))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.SERVICE_UNAVAILABLE))
                .hasMessageContaining("comfyui queue returned no prompt id");
        server.verify();
    }

    @Test
    void rejectsHistoryWithoutImages() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        server.expect(once(), requestTo("http://comfy/history/abc"))
                .andExpect(method(GET))
                .andRespond(withSuccess("{\"abc\":{\"outputs\":{}}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.generate(txt2imgRequest(Duration.ofSeconds(1))))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.SERVICE_UNAVAILABLE))
                .hasMessageContaining("comfyui history returned no images");
        server.verify();
    }

    @Test
    void convertsRestClientFailureToServiceUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/prompt"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> provider.generate(txt2imgRequest(Duration.ofSeconds(1))))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.SERVICE_UNAVAILABLE))
                .hasMessageContaining("comfyui request failed");
        server.verify();
    }

    @Test
    void requestTimeoutAppliesToPromptHttpCall() throws IOException {
        String baseUrl = slowPromptServer(Duration.ofMillis(120));
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl(baseUrl);
        properties.getComfy().setPollInterval(Duration.ZERO);
        properties.getComfy().setMaxWait(Duration.ofSeconds(5));
        properties.setDefaultTimeout(Duration.ofSeconds(5));
        ComfyUiProvider provider = new ComfyUiProvider(RestClient.builder(), properties);

        assertThatThrownBy(() -> provider.generate(txt2imgRequest(Duration.ofMillis(10))))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.SERVICE_UNAVAILABLE))
                .hasMessageContaining("comfyui request failed");
    }

    @Test
    void upscaleUploadsSourceAndBuildsScaleWorkflow() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ComfyUiProvider provider = provider(builder);

        server.expect(once(), requestTo("http://comfy/upload/image"))
                .andExpect(method(POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
                .andExpect(content().string(containsString("source-image")))
                .andRespond(withSuccess("""
                        {"name":"uploaded-source.png","subfolder":"","type":"input"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://comfy/prompt"))
                .andExpect(method(POST))
                .andExpect(content().json("""
                        {
                          "prompt": {
                            "1": {
                              "class_type": "LoadImage",
                              "inputs": {"image": "uploaded-source.png"}
                            },
                            "2": {
                              "class_type": "ImageScaleBy",
                              "inputs": {
                                "image": ["1", 0],
                                "scale_by": 4
                              }
                            },
                            "3": {
                              "class_type": "SaveImage",
                              "inputs": {"images": ["2", 0]}
                            }
                          }
                        }
                        """))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        expectQueue(server);
        expectHistory(server, "abc", "upscaled.png", "", "output");
        expectView(server, "upscaled.png", "", "output");

        ImageGenerationResponse response = provider.upscale(new ImageGenerationRequest(
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
                null,
                Map.of("scale", 4),
                Duration.ofSeconds(1)
        ));

        assertThat(response.mode()).isEqualTo("upscale");
        assertThat(response.images()).hasSize(1);
        server.verify();
    }

    private ComfyUiProvider provider(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("http://comfy").build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        properties.getComfy().setMaxWait(Duration.ofSeconds(1));
        return new ComfyUiProvider(restClient, properties);
    }

    private ImageGenerationRequest txt2imgRequest(Duration timeout) {
        return new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "txt2img",
                "cat",
                "blur",
                7L,
                20,
                6.5,
                "euler",
                "normal",
                768,
                1024,
                2,
                0.45,
                "sdxl.safetensors",
                null,
                List.of(),
                null,
                null,
                null,
                null,
                timeout
        );
    }

    private Map<String, Object> workflowJson() {
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("1", node("CLIPTextEncode", Map.of("text", "old positive")));
        workflow.put("2", node("CLIPTextEncode", Map.of("text", "old negative")));
        workflow.put("3", node("KSampler", Map.of(
                "seed", 1,
                "steps", 1,
                "cfg", 1.0,
                "sampler_name", "old",
                "scheduler", "old",
                "denoise", 1.0
        )));
        workflow.put("4", node("EmptyLatentImage", Map.of("width", 512, "height", 512, "batch_size", 1)));
        workflow.put("5", node("CheckpointLoaderSimple", Map.of("ckpt_name", "old.safetensors")));
        workflow.put("6", node("VAELoader", Map.of("vae_name", "old-vae.safetensors")));
        workflow.put("7", node("LoraLoader", Map.of(
                "lora_name", "old-lora.safetensors",
                "strength_model", 0.1,
                "strength_clip", 0.1
        )));
        return workflow;
    }

    private Map<String, Object> fluxWorkflowJson() {
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("1", node("UNETLoader", Map.of("unet_name", "old-flux.safetensors")));
        workflow.put("2", node("EmptySD3LatentImage", Map.of("width", 512, "height", 512, "batch_size", 1)));
        workflow.put("3", node("RandomNoise", Map.of("noise_seed", 1)));
        workflow.put("4", node("BasicScheduler", Map.of("steps", 1, "scheduler", "old", "denoise", 1.0)));
        workflow.put("5", node("CFGGuider", Map.of("cfg", 1.0)));
        workflow.put("6", node("KSamplerSelect", Map.of("sampler_name", "old")));
        workflow.put("7", node("LoraLoader", Map.of(
                "lora_name", "old-a.safetensors",
                "strength_model", 0.1,
                "strength_clip", 0.1
        )));
        workflow.put("8", node("LoraLoader", Map.of(
                "lora_name", "old-b.safetensors",
                "strength_model", 0.1,
                "strength_clip", 0.1
        )));
        return workflow;
    }

    private Map<String, Object> node(String classType, Map<String, Object> inputs) {
        return Map.of("class_type", classType, "inputs", inputs);
    }

    private void expectQueue(MockRestServiceServer server) {
        server.expect(once(), requestTo("http://comfy/queue"))
                .andExpect(method(GET))
                .andRespond(withSuccess("""
                        {"queue_running":[],"queue_pending":[]}
                        """, MediaType.APPLICATION_JSON));
    }

    private void expectHistory(MockRestServiceServer server, String promptId, String filename, String subfolder,
                               String type) {
        server.expect(once(), requestTo("http://comfy/history/" + promptId))
                .andExpect(method(GET))
                .andRespond(withSuccess("""
                        {
                          "%s": {
                            "outputs": {
                              "9": {
                                "images": [
                                  {"filename": "%s", "subfolder": "%s", "type": "%s"}
                                ]
                              }
                            }
                          }
                        }
                        """.formatted(promptId, filename, subfolder, type), MediaType.APPLICATION_JSON));
    }

    private void expectView(MockRestServiceServer server, String filename, String subfolder, String type) {
        server.expect(once(), requestTo("http://comfy/view?filename=" + filename + "&subfolder=" + subfolder
                + "&type=" + type))
                .andExpect(method(GET))
                .andRespond(withSuccess("image-bytes", MediaType.IMAGE_PNG));
    }

    private String slowPromptServer(Duration delay) throws IOException {
        httpServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        httpServer.createContext("/prompt", exchange -> {
            try {
                Thread.sleep(delay.toMillis());
                byte[] body = "{\"prompt_id\":\"abc\"}".getBytes();
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream output = exchange.getResponseBody()) {
                    output.write(body);
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        httpServer.start();
        return "http://127.0.0.1:" + httpServer.getAddress().getPort();
    }
}
