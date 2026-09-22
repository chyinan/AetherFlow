package com.aetherflow.auth.web;

// pattern: Imperative Shell

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Arrays;

@Component
public class OAuthBrowserStateService {

    public static final String GITHUB_COOKIE_NAME = "aetherflow_github_oauth_state";
    public static final String GOOGLE_COOKIE_NAME = "aetherflow_google_oauth_state";
    private static final Duration STATE_COOKIE_TTL = Duration.ofMinutes(10);

    public void write(String provider, String state, HttpServletRequest request, HttpServletResponse response) {
        String cookieName = cookieName(provider);
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, cookieName, state, STATE_COOKIE_TTL).toString());
    }

    public boolean matches(String provider, String state, HttpServletRequest request) {
        if (!StringUtils.hasText(state) || request == null || request.getCookies() == null) {
            return false;
        }
        String expected = cookieName(provider);
        return Arrays.stream(request.getCookies())
                .filter(cookie -> expected.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(StringUtils::hasText)
                .anyMatch(value -> MessageDigest.isEqual(
                        value.getBytes(StandardCharsets.UTF_8),
                        state.getBytes(StandardCharsets.UTF_8)));
    }

    public boolean consume(String provider,
                           String state,
                           HttpServletRequest request,
                           HttpServletResponse response) {
        boolean matches = matches(provider, state, request);
        clear(provider, request, response);
        return matches;
    }

    public void clear(String provider, HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE,
                cookie(request, cookieName(provider), "", Duration.ZERO).toString());
    }

    private String cookieName(String provider) {
        if ("github".equalsIgnoreCase(provider)) {
            return GITHUB_COOKIE_NAME;
        }
        if ("google".equalsIgnoreCase(provider)) {
            return GOOGLE_COOKIE_NAME;
        }
        throw new IllegalArgumentException("unsupported oauth provider");
    }

    private ResponseCookie cookie(HttpServletRequest request, String name, String value, Duration maxAge) {
        return ResponseCookie.from(name, value == null ? "" : value)
                .httpOnly(true)
                .secure(isSecure(request))
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private boolean isSecure(HttpServletRequest request) {
        String forwardedProto = request == null ? null : request.getHeader("X-Forwarded-Proto");
        return request != null && (request.isSecure()
                || (StringUtils.hasText(forwardedProto)
                && "https".equalsIgnoreCase(forwardedProto.split(",")[0].trim())));
    }
}
