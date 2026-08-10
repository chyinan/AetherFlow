package com.aetherflow.auth.controller;

import com.aetherflow.auth.config.AuthProperties;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OAuthProviderControllerTest {

    @Test
    void reportsOnlyProvidersWithCompleteCredentialsAsAvailable() throws Exception {
        AuthProperties properties = new AuthProperties();
        properties.getOauth().getGithub().setClientId("github-client");
        properties.getOauth().getGithub().setClientSecret("github-secret");
        properties.getOauth().getGoogle().setClientId("google-client");

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new OAuthProviderController(properties)).build();

        mockMvc.perform(get("/auth/oauth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.githubConfigured").value(true))
                .andExpect(jsonPath("$.data.googleConfigured").value(false));
    }
}
