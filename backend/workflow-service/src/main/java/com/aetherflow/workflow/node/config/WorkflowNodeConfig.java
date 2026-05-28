package com.aetherflow.workflow.node.config;

import io.minio.MinioClient;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(WorkflowNodeConfig.MinioProperties.class)
public class WorkflowNodeConfig {

    @Bean
    public MinioClient workflowNodeMinioClient(MinioProperties properties) {
        return MinioClient.builder()
                .endpoint(properties.getEndpoint())
                .credentials(properties.getAccessKey(), properties.getSecretKey())
                .build();
    }

    @Data
    @ConfigurationProperties(prefix = "aetherflow.minio")
    public static class MinioProperties {

        private String endpoint = "http://192.168.101.68:9000";
        private String publicEndpoint = "http://192.168.101.68:9000";
        private String accessKey = "minioadmin";
        private String secretKey = "minioadmin";
        private String bucket = "aetherflow";
    }
}
