package com.aetherflow.file.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.minio")
public class MinioProperties {

    private String endpoint = "http://192.168.101.68:9000";
    private String publicEndpoint = "http://192.168.101.68:9000";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private String bucket = "aetherflow";
}

