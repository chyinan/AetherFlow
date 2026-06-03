package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class RedisOAuth2AuthorizationRequestRepository
        implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    private static final String REQUEST_PREFIX = "auth:oauth2:google:authorization:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AuthProperties authProperties;
    private final GoogleOAuthRedirectStateService redirectStateService;

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        String state = state(request);
        if (!StringUtils.hasText(state)) {
            return null;
        }
        String payload = redisTemplate.opsForValue().get(key(state));
        if (!StringUtils.hasText(payload)) {
            return null;
        }
        return deserialize(payload);
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest,
                                         HttpServletRequest request,
                                         HttpServletResponse response) {
        if (authorizationRequest == null) {
            removeAuthorizationRequest(request, response);
            return;
        }
        redisTemplate.opsForValue().set(key(authorizationRequest.getState()),
                serialize(authorizationRequest),
                Duration.ofMinutes(authProperties.getOauth().getGoogle().getStateTtlMinutes()));
        redirectStateService.storeRedirectPath(authorizationRequest.getState(), request.getParameter("redirect"));
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request,
                                                                HttpServletResponse response) {
        OAuth2AuthorizationRequest authorizationRequest = loadAuthorizationRequest(request);
        String state = state(request);
        if (StringUtils.hasText(state)) {
            redisTemplate.delete(key(state));
        }
        return authorizationRequest;
    }

    private String state(HttpServletRequest request) {
        return request.getParameter(OAuth2ParameterNames.STATE);
    }

    private String key(String state) {
        return REQUEST_PREFIX + state.trim();
    }

    private String serialize(OAuth2AuthorizationRequest authorizationRequest) {
        try {
            AuthorizationRequestPayload payload = new AuthorizationRequestPayload(
                    authorizationRequest.getAuthorizationUri(),
                    authorizationRequest.getAuthorizationRequestUri(),
                    authorizationRequest.getClientId(),
                    authorizationRequest.getRedirectUri(),
                    authorizationRequest.getScopes(),
                    authorizationRequest.getState(),
                    authorizationRequest.getAdditionalParameters(),
                    authorizationRequest.getAttributes());
            return objectMapper.writeValueAsString(payload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("could not serialize oauth2 authorization request", exception);
        }
    }

    private OAuth2AuthorizationRequest deserialize(String payload) {
        try {
            AuthorizationRequestPayload value = objectMapper.readValue(payload, AuthorizationRequestPayload.class);
            OAuth2AuthorizationRequest.Builder builder = OAuth2AuthorizationRequest.authorizationCode()
                    .authorizationUri(value.authorizationUri())
                    .clientId(value.clientId())
                    .redirectUri(value.redirectUri())
                    .scopes(value.scopes())
                    .state(value.state())
                    .additionalParameters(value.additionalParameters())
                    .attributes(value.attributes());
            if (StringUtils.hasText(value.authorizationRequestUri())) {
                builder.authorizationRequestUri(value.authorizationRequestUri());
            }
            return builder.build();
        } catch (Exception exception) {
            throw new IllegalArgumentException("could not deserialize oauth2 authorization request", exception);
        }
    }

    private record AuthorizationRequestPayload(
            String authorizationUri,
            String authorizationRequestUri,
            String clientId,
            String redirectUri,
            Set<String> scopes,
            String state,
            Map<String, Object> additionalParameters,
            Map<String, Object> attributes
    ) {
    }
}
