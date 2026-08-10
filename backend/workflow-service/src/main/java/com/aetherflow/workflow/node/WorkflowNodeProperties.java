package com.aetherflow.workflow.node;

import com.aetherflow.common.security.InternalServiceTokenService;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Data
@Component
@ConfigurationProperties(prefix = "aetherflow.workflow.node")
public class WorkflowNodeProperties {

    private String fileInternalToken = "aetherflow-file-internal-dev-token";
    private String defaultWhisperLanguage = "auto";
    private String defaultSummaryLanguage = "English";
    private String exportObjectPrefix = "workflow/exports";
    private boolean codeExecutionEnabled = false;
    private String codeRuntimeUrl = "http://python-ai-service:8200";
    private int codeTimeoutMs = 2_000;
    private int codeMaxOutputBytes = 64_000;
    private boolean humanAutoApproveEnabled = false;
    private boolean asyncAiEnabled = true;

    public String issueFileInternalToken() {
        return new InternalServiceTokenService(fileInternalToken, "aetherflow-internal", Duration.ofMinutes(1))
                .issue("file-service", Instant.now());
    }
}
