package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class RestGithubOAuthClient implements GithubOAuthClient {

    private final AuthProperties authProperties;
    private final RestClient.Builder restClientBuilder;

    @Override
    public String exchangeCode(String code, String redirectUri) {
        AuthProperties.OAuth.Github github = authProperties.getOauth().getGithub();
        LinkedMultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", github.getClientId());
        body.add("client_secret", github.getClientSecret());
        body.add("code", code);
        body.add("redirect_uri", redirectUri);

        @SuppressWarnings("unchecked")
        Map<String, Object> response = restClientBuilder.build()
                .post()
                .uri(github.getTokenUri())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(body)
                .retrieve()
                .body(Map.class);

        Object accessToken = response == null ? null : response.get("access_token");
        if (!(accessToken instanceof String token) || !StringUtils.hasText(token)) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "github oauth token exchange failed");
        }
        return token;
    }

    @Override
    public GithubOAuthUser fetchUser(String accessToken) {
        AuthProperties.OAuth.Github github = authProperties.getOauth().getGithub();
        @SuppressWarnings("unchecked")
        Map<String, Object> profile = restClientBuilder.build()
                .get()
                .uri(github.getUserUri())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .header(HttpHeaders.ACCEPT, "application/vnd.github+json")
                .retrieve()
                .body(Map.class);

        if (profile == null || profile.get("id") == null || !StringUtils.hasText(asString(profile.get("login")))) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "github user profile is incomplete");
        }

        String email = asString(profile.get("email"));
        if (!StringUtils.hasText(email)) {
            email = fetchPrimaryEmail(accessToken, github.getEmailsUri());
        }

        return new GithubOAuthUser(
                asString(profile.get("id")),
                asString(profile.get("login")),
                asString(profile.get("name")),
                email,
                asString(profile.get("avatar_url"))
        );
    }

    private String fetchPrimaryEmail(String accessToken, String emailsUri) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> emails = restClientBuilder.build()
                    .get()
                    .uri(emailsUri)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .header(HttpHeaders.ACCEPT, "application/vnd.github+json")
                    .retrieve()
                    .body(List.class);
            if (emails == null) {
                return "";
            }
            return emails.stream()
                    .filter(item -> Boolean.TRUE.equals(item.get("primary")))
                    .filter(item -> Boolean.TRUE.equals(item.get("verified")))
                    .map(item -> asString(item.get("email")))
                    .filter(StringUtils::hasText)
                    .findFirst()
                    .orElse("");
        } catch (RuntimeException exception) {
            return "";
        }
    }

    private String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
