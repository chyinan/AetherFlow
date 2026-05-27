package com.aetherflow.common.config;

import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OpenApiConfigTest {

    @Test
    void commonOpenApiBeanUsesAetherFlowMetadata() {
        OpenAPI openAPI = new OpenApiConfig().aetherFlowOpenAPI();

        assertThat(openAPI.getInfo().getTitle()).isEqualTo("AetherFlow API");
        assertThat(openAPI.getComponents().getSecuritySchemes()).containsKey("bearerAuth");
    }
}
