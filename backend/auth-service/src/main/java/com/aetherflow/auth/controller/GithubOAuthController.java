package com.aetherflow.auth.controller;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.oauth.GithubOAuthLoginResult;
import com.aetherflow.auth.oauth.GithubOAuthService;
import com.aetherflow.auth.oauth.GithubOAuthStateService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.auth.web.RefreshTokenCookieService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ResponseCookie;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.StringJoiner;

@RestController
@RequestMapping("/auth/oauth/github")
@RequiredArgsConstructor
public class GithubOAuthController {

    private final GithubOAuthService githubOAuthService;
    private final GithubOAuthStateService stateService;
    private final AuthProperties authProperties;
    private final RefreshTokenCookieService refreshTokenCookieService;

    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(
            @RequestParam(value = "redirect", required = false) String redirectPath,
            HttpServletRequest request) {
        String callbackUri = configuredCallbackUri(request);
        String authorizeUrl = githubOAuthService.createAuthorizationUrl(redirectPath, callbackUri);
        String state = org.springframework.web.util.UriComponentsBuilder.fromUriString(authorizeUrl)
                .build()
                .getQueryParams()
                .getFirst("state");
        return redirectWithStateCookie(authorizeUrl, state, request);
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            HttpServletRequest request,
        HttpServletResponse response) {
        try {
            if (!stateMatchesBrowserCookie(request, state)) {
                throw new IllegalArgumentException("invalid oauth state");
            }
            GithubOAuthLoginResult result = githubOAuthService.completeLogin(code, state, AuthRequestContext.from(request));
            AuthTokenResponse token = result.tokenResponse();
            refreshTokenCookieService.write(request, response, token.getRefreshToken(), token.getRefreshExpiresIn());
            return redirectWithClearedStateCookie(successRedirectUrl(result), request);
        } catch (RuntimeException exception) {
            return redirectWithClearedStateCookie(failureRedirectUrl(exception), request);
        }
    }

    private boolean stateMatchesBrowserCookie(HttpServletRequest request, String state) {
        if (!StringUtils.hasText(state) || request.getCookies() == null) {
            return false;
        }
        return java.util.Arrays.stream(request.getCookies())
                .filter(cookie -> GithubOAuthStateService.BROWSER_COOKIE_NAME.equals(cookie.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .anyMatch(state::equals);
    }

    private String successRedirectUrl(GithubOAuthLoginResult result) {
        AuthTokenResponse token = result.tokenResponse();
        StringJoiner fragment = new StringJoiner("&");
        fragment.add("accessToken=" + encode(token.getAccessToken()));
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

    private ResponseEntity<Void> redirectWithStateCookie(String location, String state, HttpServletRequest request) {
        ResponseCookie cookie = ResponseCookie.from(GithubOAuthStateService.BROWSER_COOKIE_NAME, state == null ? "" : state)
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .path("/auth/oauth/github")
                .maxAge(java.time.Duration.ofMinutes(authProperties.getOauth().getGithub().getStateTtlMinutes()))
                .build();
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
    }

    private ResponseEntity<Void> redirectWithClearedStateCookie(String location, HttpServletRequest request) {
        ResponseCookie cookie = ResponseCookie.from(GithubOAuthStateService.BROWSER_COOKIE_NAME, "")
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .path("/auth/oauth/github")
                .maxAge(Duration.ZERO)
                .build();
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
