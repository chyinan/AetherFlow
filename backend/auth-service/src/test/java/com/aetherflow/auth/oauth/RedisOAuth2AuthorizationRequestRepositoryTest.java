package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import java.time.Duration;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisOAuth2AuthorizationRequestRepositoryTest {

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private GoogleOAuthRedirectStateService redirectStateService;
    private RedisOAuth2AuthorizationRequestRepository repository;

    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        redirectStateService = mock(GoogleOAuthRedirectStateService.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        AuthProperties authProperties = new AuthProperties();
        authProperties.getOauth().getGoogle().setStateTtlMinutes(10);
        repository = new RedisOAuth2AuthorizationRequestRepository(
                redisTemplate,
                new ObjectMapper(),
                authProperties,
                redirectStateService);
    }

    @Test
    void savesLoadsAndRemovesAuthorizationRequestByStateWithoutHttpSession() {
        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .clientId("google-client")
                .redirectUri("http://localhost:8080/login/oauth2/code/google")
                .scopes(Set.of("openid", "profile", "email"))
                .state("state-1")
                .additionalParameters(Map.of("prompt", "select_account"))
                .attributes(Map.of("registration_id", "google"))
                .build();
        MockHttpServletRequest saveRequest = new MockHttpServletRequest("GET", "/oauth2/authorization/google");
        saveRequest.setParameter("redirect", "/projects");
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveAuthorizationRequest(authorizationRequest, saveRequest, response);

        ArgumentCaptor<String> storedPayload = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(eq("auth:oauth2:google:authorization:state-1"), storedPayload.capture(),
                eq(Duration.ofMinutes(10)));
        verify(redirectStateService).storeRedirectPath("state-1", "/projects");

        HttpServletRequest callbackRequest = callbackRequest("state-1");
        when(valueOperations.get("auth:oauth2:google:authorization:state-1")).thenReturn(storedPayload.getValue());

        OAuth2AuthorizationRequest loaded = repository.loadAuthorizationRequest(callbackRequest);

        assertThat(loaded.getState()).isEqualTo("state-1");
        assertThat(loaded.getClientId()).isEqualTo("google-client");
        assertThat(loaded.getRedirectUri()).isEqualTo("http://localhost:8080/login/oauth2/code/google");
        assertThat(loaded.getScopes()).contains("openid", "profile", "email");
        assertThat(loaded.getAttributes()).containsEntry("registration_id", "google");

        OAuth2AuthorizationRequest removed = repository.removeAuthorizationRequest(callbackRequest, response);

        assertThat(removed.getState()).isEqualTo("state-1");
        verify(redisTemplate).delete("auth:oauth2:google:authorization:state-1");
    }

    private HttpServletRequest callbackRequest(String state) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/login/oauth2/code/google");
        request.setParameter("state", state);
        return request;
    }
}
