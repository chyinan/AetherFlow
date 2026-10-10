package com.aetherflow.ai.config;

// pattern: Imperative Shell

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class AiClientConfigContractTest {

    @Test
    void pythonRuntimeClientPinsHttp11ForPutCompatibility() throws IOException {
        String source = Files.readString(repositoryRoot().resolve(
                "backend/ai-service/src/main/java/com/aetherflow/ai/config/AiClientConfig.java"));

        assertThat(source)
                .contains("version(HttpClient.Version.HTTP_1_1)");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
