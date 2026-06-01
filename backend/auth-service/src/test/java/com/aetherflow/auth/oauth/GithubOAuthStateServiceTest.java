package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GithubOAuthStateServiceTest {

    @Test
    void signsAndValidatesRedirectState() {
        GithubOAuthStateService stateService = new GithubOAuthStateService(properties(), new ObjectMapper());

        String state = stateService.createState("/projects", "http://localhost/api/auth/oauth/github/callback");
        GithubOAuthStateService.ValidatedState validatedState = stateService.validateState(state);

        assertThat(validatedState.redirectPath()).isEqualTo("/projects");
        assertThat(validatedState.callbackUri()).isEqualTo("http://localhost/api/auth/oauth/github/callback");
    }

    @Test
    void rejectsTamperedState() {
        GithubOAuthStateService stateService = new GithubOAuthStateService(properties(), new ObjectMapper());

        String state = stateService.createState("/projects", "http://localhost/api/auth/oauth/github/callback");

        assertThatThrownBy(() -> stateService.validateState(state + "tampered"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("invalid oauth state");
    }

    private AuthProperties properties() {
        AuthProperties properties = new AuthProperties();
        properties.getOauth().getGithub().setStateSecret("aetherflow-github-oauth-state-secret-32bytes");
        return properties;
    }
}
