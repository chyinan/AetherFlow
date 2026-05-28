package com.aetherflow.workflow.node.config;

import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowNodeConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(WorkflowNodeConfig.class)
            .withPropertyValues(
                    "aetherflow.minio.endpoint=http://localhost:9000",
                    "aetherflow.minio.public-endpoint=http://localhost:9000",
                    "aetherflow.minio.access-key=minioadmin",
                    "aetherflow.minio.secret-key=minioadmin",
                    "aetherflow.minio.bucket=aetherflow-test"
            );

    @Test
    void createsMinioClientFromAetherflowMinioProperties() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(MinioClient.class);
            WorkflowNodeConfig.MinioProperties properties = context.getBean(WorkflowNodeConfig.MinioProperties.class);
            assertThat(properties.getBucket()).isEqualTo("aetherflow-test");
            assertThat(properties.getPublicEndpoint()).isEqualTo("http://localhost:9000");
        });
    }
}
