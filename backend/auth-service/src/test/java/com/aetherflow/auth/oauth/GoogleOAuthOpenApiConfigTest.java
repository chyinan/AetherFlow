package com.aetherflow.auth.oauth;

import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleOAuthOpenApiConfigTest {

    @Test
    void addsGoogleOauthLoginEndpointsToOpenApi() {
        OpenAPI openAPI = new OpenAPI();

        new GoogleOAuthOpenApiConfig().googleOAuthOpenApiCustomizer().customise(openAPI);

        assertThat(openAPI.getPaths()).containsKeys(
                "/oauth2/authorization/google",
                "/login/oauth2/code/google");
        assertThat(openAPI.getPaths().get("/oauth2/authorization/google").getGet().getSummary())
                .isEqualTo("Start Google OAuth2 login");
    }
}
