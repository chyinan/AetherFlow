package com.aetherflow.ai.config;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ImageProviderConfigurationContractTest {

    @Test
    void applicationProfilesExposeFailClosedImageProviderConfiguration() throws IOException {
        Path root = repositoryRoot();
        String application = Files.readString(root.resolve(
                "backend/ai-service/src/main/resources/application.yml"));
        String production = Files.readString(root.resolve(
                "backend/ai-service/src/main/resources/application-prod.yml"));

        assertImageConfiguration(application);
        assertImageConfiguration(production);
    }

    @Test
    void composePassesExplicitImageProviderSettingsToAiService() throws IOException {
        Path root = repositoryRoot();
        String compose = Files.readString(root.resolve("docker-compose.yml"));
        String example = Files.readString(root.resolve(".env.example"));

        assertThat(compose)
                .contains("SD_WEBUI_ENABLED: ${SD_WEBUI_ENABLED:-false}")
                .contains("AI_IMAGE_HEALTH_TIMEOUT: ${AI_IMAGE_HEALTH_TIMEOUT:-2s}")
                .contains("AI_IMAGE_HEALTH_CACHE_TTL: ${AI_IMAGE_HEALTH_CACHE_TTL:-10s}")
                .contains("SD_WEBUI_BASE_URL: ${SD_WEBUI_BASE_URL:-http://host.docker.internal:7860}")
                .contains("COMFYUI_ENABLED: ${COMFYUI_ENABLED:-false}")
                .contains("COMFYUI_BASE_URL: ${COMFYUI_BASE_URL:-http://host.docker.internal:8188}");
        assertThat(example)
                .contains("AI_IMAGE_HEALTH_TIMEOUT=2s")
                .contains("AI_IMAGE_HEALTH_CACHE_TTL=10s")
                .contains("SD_WEBUI_ENABLED=false")
                .contains("SD_WEBUI_BASE_URL=http://host.docker.internal:7860")
                .contains("COMFYUI_ENABLED=false")
                .contains("COMFYUI_BASE_URL=http://host.docker.internal:8188");
    }

    private void assertImageConfiguration(String yaml) {
        assertThat(yaml)
                .contains("image:")
                .contains("default-timeout: ${AI_IMAGE_DEFAULT_TIMEOUT:5m}")
                .contains("health-timeout: ${AI_IMAGE_HEALTH_TIMEOUT:2s}")
                .contains("health-cache-ttl: ${AI_IMAGE_HEALTH_CACHE_TTL:10s}")
                .contains("enabled: ${SD_WEBUI_ENABLED:false}")
                .contains("base-url: ${SD_WEBUI_BASE_URL:")
                .contains("enabled: ${COMFYUI_ENABLED:false}")
                .contains("base-url: ${COMFYUI_BASE_URL:");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker-compose.yml"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
