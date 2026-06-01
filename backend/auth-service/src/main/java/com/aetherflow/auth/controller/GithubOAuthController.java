package com.aetherflow.auth.controller;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.oauth.GithubOAuthLoginResult;
import com.aetherflow.auth.oauth.GithubOAuthService;
import com.aetherflow.auth.web.AuthRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.StringJoiner;

@RestController
@RequestMapping("/auth/oauth/github")
@RequiredArgsConstructor
public class GithubOAuthController {

    private final GithubOAuthService githubOAuthService;
    private final AuthProperties authProperties;

    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(
            @RequestParam(value = "redirect", required = false) String redirectPath,
            HttpServletRequest request) {
        String callbackUri = configuredCallbackUri(request);
        String authorizeUrl = githubOAuthService.createAuthorizationUrl(redirectPath, callbackUri);
        return redirect(authorizeUrl);
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            HttpServletRequest request) {
        try {
            GithubOAuthLoginResult result = githubOAuthService.completeLogin(code, state, AuthRequestContext.from(request));
            return redirect(successRedirectUrl(result));
        } catch (RuntimeException exception) {
            return redirect(failureRedirectUrl(exception));
        }
    }

    private String successRedirectUrl(GithubOAuthLoginResult result) {
        AuthTokenResponse token = result.tokenResponse();
        StringJoiner fragment = new StringJoiner("&");
        fragment.add("accessToken=" + encode(token.getAccessToken()));
        fragment.add("refreshToken=" + encode(token.getRefreshToken()));
        fragment.add("tokenType=" + encode(token.getTokenType()));
        fragment.add("expiresIn=" + token.getExpiresIn());
        fragment.add("refreshExpiresIn=" + token.getRefreshExpiresIn());
        fragment.add("userId=" + token.getUserId());
        fragment.add("username=" + encode(token.getUsername()));
        fragment.add("roles=" + encode(String.join(",", token.getRoles())));
        fragment.add("redirect=" + encode(result.redirectPath()));
        return frontendBaseUrl() + authProperties.getOauth().getGithub().getSuccessPath() + "#" + fragment;
    }

    private String failureRedirectUrl(RuntimeException exception) {
        return frontendBaseUrl()
                + authProperties.getOauth().getGithub().getFailurePath()
                + "?oauth=failed&reason="
                + encode(exception.getMessage() == null ? "github oauth failed" : exception.getMessage());
    }

    private String configuredCallbackUri(HttpServletRequest request) {
        String configured = authProperties.getOauth().getGithub().getRedirectUri();
        if (StringUtils.hasText(configured)) {
            return configured.trim();
        }
        return requestOrigin(request) + forwardedPrefix(request) + "/auth/oauth/github/callback";
    }

    private String frontendBaseUrl() {
        String configured = authProperties.getOauth().getGithub().getFrontendBaseUrl();
        return StringUtils.hasText(configured) ? configured.replaceAll("/+$", "") : "";
    }

    private String requestOrigin(HttpServletRequest request) {
        String proto = headerOrFallback(request, "X-Forwarded-Proto", request.getScheme());
        String host = headerOrFallback(request, "X-Forwarded-Host", request.getHeader(HttpHeaders.HOST));
        if (!StringUtils.hasText(host)) {
            host = request.getServerName() + ":" + request.getServerPort();
        }
        return proto + "://" + host;
    }

    private String forwardedPrefix(HttpServletRequest request) {
        String prefix = request.getHeader("X-Forwarded-Prefix");
        if (!StringUtils.hasText(prefix)) {
            return "";
        }
        String trimmed = prefix.trim();
        return trimmed.startsWith("/") ? trimmed.replaceAll("/+$", "") : "";
    }

    private String headerOrFallback(HttpServletRequest request, String headerName, String fallback) {
        String value = request.getHeader(headerName);
        return StringUtils.hasText(value) ? value.split(",")[0].trim() : fallback;
    }

    private ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(location)).build();
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
