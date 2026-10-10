package com.aetherflow.ai.copilot.service;

// pattern: Imperative Shell

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class CopilotPromptPersistenceContractTest {

    @Test
    void copilotRequestSeparatesDisplayPromptFromModelPrompt() throws IOException {
        Path root = repositoryRoot();
        String requestSource = Files.readString(root.resolve(
                "backend/ai-service/src/main/java/com/aetherflow/ai/copilot/dto/CopilotDtos.java"));
        String serviceSource = Files.readString(root.resolve(
                "backend/ai-service/src/main/java/com/aetherflow/ai/copilot/service/impl/CopilotServiceImpl.java"));

        assertThat(requestSource).contains("private String displayPrompt;");
        assertThat(serviceSource)
                .contains("request.getDisplayPrompt()")
                .contains("persistedUserPrompt(request)");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
