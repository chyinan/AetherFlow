package com.aetherflow.task.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "xxl.job")
public class XxlJobProperties {

    private boolean enabled = false;
    private String adminAddresses;
    private String accessToken;
    private String appName = "aetherflow-task-service";
    private String address;
    private String ip;
    private int port = 9999;
    private String logPath = "./logs/xxl-job";
    private int logRetentionDays = 30;
}

