package com.aetherflow.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_AUTH = "bearerAuth";

    @Bean
    @ConditionalOnMissingBean(OpenAPI.class)
    public OpenAPI aetherFlowOpenAPI() {
        SecurityScheme bearerAuth = new SecurityScheme()
                .name(BEARER_AUTH)
                .type(SecurityScheme.Type.HTTP)
                .scheme("bearer")
                .bearerFormat("JWT");

        return new OpenAPI()
                .info(new Info()
                        .title("AetherFlow API")
                        .version("0.1.0")
                        .description("Enterprise AI media workflow automation platform APIs.")
                        .contact(new Contact().name("AetherFlow Team")))
                .components(new Components().addSecuritySchemes(BEARER_AUTH, bearerAuth))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH));
    }
}

