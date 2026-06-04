package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.task")
public class TaskClientProperties {

    private String internalToken = "aetherflow-task-internal-dev-token";
}
