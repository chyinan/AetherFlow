package com.aetherflow.ai.connection;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ImageConnectionDiscoveryTest {
    @Test
    void discoversComfyCatalogsAndOnlySupportedScaleMethods() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-comfy");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-comfy/object_info")).andRespond(withSuccess("""
                {
                  "CheckpointLoaderSimple":{"input":{"required":{"ckpt_name":[["base.safetensors"]]}}},
                  "VAELoader":{"input":{"required":{"vae_name":[["vae.safetensors"]]}}},
                  "LoraLoader":{"input":{"required":{"lora_name":[["style.safetensors"]]}}},
                  "KSampler":{"input":{"required":{"sampler_name":[["euler"]],"scheduler":[["normal"]]}}},
                  "ImageScaleBy":{"input":{"required":{"upscale_method":[["bilinear","lanczos"]]}}},
                  "UpscaleModelLoader":{"input":{"required":{"model_name":[["not-supported.pth"]]}}},
                  "CLIPTextEncode":{}, "EmptyLatentImage":{}, "VAEDecode":{}, "SaveImage":{}, "LoadImage":{}
                }
                """, MediaType.APPLICATION_JSON));
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));

        NodeConnectionProbe result = discovery.probe(profile("COMFYUI"), "base.safetensors", "IMAGE_GENERATION");

        assertThat(result.status()).isEqualTo("usable");
        assertThat(result.models().checkpoints()).containsExactly("base.safetensors");
        assertThat(result.models().vaes()).containsExactly("vae.safetensors");
        assertThat(result.models().loras()).containsExactly("style.safetensors");
        assertThat(result.models().samplers()).containsExactly("euler");
        assertThat(result.models().schedulers()).containsExactly("normal");
        assertThat(result.models().upscalers()).containsExactly("bilinear", "lanczos");
        assertThat(result.capabilities()).containsExactly("IMAGE_GENERATION", "UPSCALE");
        assertThat(result.unavailableCatalogs()).isEmpty();
        server.verify();
    }

    @Test
    void optionalSdCatalogFailureIsUnknownRatherThanMissingModel() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-sd");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-sd/sdapi/v1/options")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://fake-sd/sdapi/v1/sd-models")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        expect(server, "sd-vae", "[{\"model_name\":\"vae.pt\"}]");
        expect(server, "loras", "[{\"name\":\"style\"}]");
        expect(server, "samplers", "[{\"name\":\"Euler a\"}]");
        server.expect(requestTo("http://fake-sd/sdapi/v1/schedulers")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        expect(server, "upscalers", "[{\"name\":\"Lanczos\"}]");
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));

        NodeConnectionProbe result = discovery.probe(profile("STABLE_DIFFUSION_WEBUI"), "selected.ckpt", "IMAGE_GENERATION");

        assertThat(result.status()).isEqualTo("usable");
        assertThat(result.unavailableCatalogs()).containsExactly("checkpoints", "schedulers");
        assertThat(result.models().vaes()).containsExactly("vae.pt");
        assertThat(result.warnings()).anyMatch(message -> message.contains("无法读取"));
        server.verify();
    }

    @Test
    void successfulEmptySdCatalogMeansMissingModel() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-sd");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-sd/sdapi/v1/options")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        for (String endpoint : new String[]{"sd-models", "sd-vae", "loras", "samplers", "schedulers", "upscalers"}) {
            expect(server, endpoint, "[]");
        }
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));
        assertThat(discovery.probe(profile("STABLE_DIFFUSION_WEBUI"), null, "IMAGE_GENERATION").status()).isEqualTo("missing_model");
        server.verify();
    }

    @Test
    void malformedAndTruncatedCatalogsCannotProveMissingModels() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-sd");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-sd/sdapi/v1/options")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        expect(server, "sd-models", "[{\"wrong_field\":\"selected.ckpt\"}]");
        expect(server, "sd-vae", "[]");
        expect(server, "loras", "[]");
        String largeSamplers = "[" + String.join(",", java.util.Collections.nCopies(2001, "{\"name\":\"Euler\"}")) + "]";
        expect(server, "samplers", largeSamplers);
        expect(server, "schedulers", "[]");
        expect(server, "upscalers", "[]");
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));

        var result = discovery.probe(profile("STABLE_DIFFUSION_WEBUI"), "selected.ckpt", "IMAGE_GENERATION");
        assertThat(result.status()).isEqualTo("usable");
        assertThat(result.unavailableCatalogs()).containsExactly("checkpoints", "samplers");
        assertThat(result.models().samplers()).containsExactly("Euler");
        server.verify();
    }

    @Test
    void malformedComfyCheckpointCatalogIsUnknownInsteadOfMissing() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-comfy");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-comfy/object_info")).andRespond(withSuccess("""
                {"CheckpointLoaderSimple":{"input":{"required":{"ckpt_name":[[123]]}}},
                 "CLIPTextEncode":{}, "KSampler":{}, "EmptyLatentImage":{}, "VAEDecode":{}, "SaveImage":{}}
                """, MediaType.APPLICATION_JSON));
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));
        var result = discovery.probe(profile("COMFYUI"), "selected.ckpt", "IMAGE_GENERATION");
        assertThat(result.status()).isEqualTo("usable");
        assertThat(result.unavailableCatalogs()).contains("checkpoints");
        server.verify();
    }

    @Test
    void mainProbeFailureReturnsUnreachable() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fake-comfy");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://fake-comfy/object_info")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        ImageConnectionDiscovery discovery = new ImageConnectionDiscovery((url, timeout) -> builder.build(), Duration.ofSeconds(1));
        assertThat(discovery.probe(profile("COMFYUI"), null, null).status()).isEqualTo("unreachable");
        server.verify();
    }

    private void expect(MockRestServiceServer server, String endpoint, String json) {
        server.expect(requestTo("http://fake-sd/sdapi/v1/" + endpoint)).andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    private NodeConnectionProfile profile(String provider) {
        return new NodeConnectionProfile("saved", "测试连接", provider,
                provider.equals("COMFYUI") ? "http://fake-comfy" : "http://fake-sd", false);
    }
}
