package com.aetherflow.workflow.node;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "aetherflow.workflow.node")
public class WorkflowNodeProperties {

    private String fileInternalToken = "aetherflow-file-internal-dev-token";
    private String defaultWhisperLanguage = "auto";
    private String defaultSummaryLanguage = "English";
    private String exportObjectPrefix = "workflow/exports";
    private boolean codeExecutionEnabled = false;
    private boolean humanAutoApproveEnabled = false;
}
