package com.aetherflow.auth.oauth;

import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GoogleOAuthOpenApiConfig {

    @Bean
    public OpenApiCustomizer googleOAuthOpenApiCustomizer() {
        return openApi -> {
            openApi.path("/oauth2/authorization/google", new PathItem()
                    .get(new Operation()
                            .addTagsItem("User Auth")
                            .summary("Start Google OAuth2 login")
                            .description("Redirects the browser to Google. Auth Service validates Google, creates or binds the local user, then issues AetherFlow JWT tokens on success.")
                            .addParametersItem(new Parameter()
                                    .name("redirect")
                                    .in("query")
                                    .required(false)
                                    .schema(new StringSchema()._default("/projects"))
                                    .description("Frontend path to return to after AetherFlow JWT session creation."))
                            .responses(new io.swagger.v3.oas.models.responses.ApiResponses()
                                    .addApiResponse("302", new ApiResponse().description("Redirect to Google authorization page.")))));

            openApi.path("/login/oauth2/code/google", new PathItem()
                    .get(new Operation()
                            .addTagsItem("User Auth")
                            .summary("Handle Google OAuth2 callback")
                            .description("Callback endpoint used by Google. It is handled by Spring Security OAuth2 Client and redirects to the frontend OAuth callback with AetherFlow JWT tokens in the URL fragment.")
                            .addParametersItem(new Parameter()
                                    .name("code")
                                    .in("query")
                                    .required(true)
                                    .schema(new StringSchema())
                                    .description("Google authorization code."))
                            .addParametersItem(new Parameter()
                                    .name("state")
                                    .in("query")
                                    .required(true)
                                    .schema(new StringSchema())
                                    .description("OAuth state stored by Auth Service in Redis."))
                            .responses(new io.swagger.v3.oas.models.responses.ApiResponses()
                                    .addApiResponse("302", new ApiResponse().description("Redirect to frontend OAuth callback or login failure page.")))));
        };
    }
}
