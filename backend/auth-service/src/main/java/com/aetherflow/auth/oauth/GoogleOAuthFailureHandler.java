package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class GoogleOAuthFailureHandler implements AuthenticationFailureHandler {

    private final AuthProperties authProperties;

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException, ServletException {
        response.sendRedirect(frontendBaseUrl()
                + authProperties.getOauth().getGoogle().getFailurePath()
                + "?oauth=failed&reason="
                + encode(exception.getMessage() == null ? "google oauth failed" : exception.getMessage()));
    }

    private String frontendBaseUrl() {
        String configured = authProperties.getOauth().getGoogle().getFrontendBaseUrl();
        return StringUtils.hasText(configured) ? configured.replaceAll("/+$", "") : "";
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
