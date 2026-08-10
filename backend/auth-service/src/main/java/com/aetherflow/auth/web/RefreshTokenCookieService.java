package com.aetherflow.auth.web;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Arrays;

@Component
public class RefreshTokenCookieService {

    public static final String COOKIE_NAME = "aetherflow_refresh";

    public String read(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return null;
        }
        return Arrays.stream(request.getCookies())
                .filter(cookie -> COOKIE_NAME.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(StringUtils::hasText)
                .findFirst()
                .orElse(null);
    }

    public void write(HttpServletRequest request, HttpServletResponse response,
                      String refreshToken, long maxAgeSeconds) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, refreshToken, Duration.ofSeconds(maxAgeSeconds)).toString());
    }

    public void clear(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, "", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(HttpServletRequest request, String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(isSecure(request))
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private boolean isSecure(HttpServletRequest request) {
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        return request.isSecure()
                || (StringUtils.hasText(forwardedProto)
                && "https".equalsIgnoreCase(forwardedProto.split(",")[0].trim()));
    }
}
