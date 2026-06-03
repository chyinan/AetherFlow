package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.StringJoiner;

@Component
@RequiredArgsConstructor
public class GoogleOAuthSuccessHandler implements AuthenticationSuccessHandler {

    private final GoogleOAuthLoginService googleOAuthLoginService;
    private final AuthProperties authProperties;
    private final GoogleOAuthRedirectStateService redirectStateService;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        try {
            GoogleOAuthUser googleUser = toGoogleUser(authentication);
            GoogleOAuthLoginResult result = googleOAuthLoginService.loginOrRegister(googleUser);
            response.sendRedirect(successRedirectUrl(result.tokenResponse(),
                    redirectStateService.consumeRedirectPath(request.getParameter("state"))));
        } catch (RuntimeException exception) {
            response.sendRedirect(failureRedirectUrl(exception));
        }
    }

    private GoogleOAuthUser toGoogleUser(Authentication authentication) {
        if (!(authentication instanceof OAuth2AuthenticationToken token)
                || !"google".equalsIgnoreCase(token.getAuthorizedClientRegistrationId())) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "unsupported oauth provider");
        }
        if (!(authentication.getPrincipal() instanceof OAuth2User principal)) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "google user profile is incomplete");
        }
        Map<String, Object> attributes = principal.getAttributes();
        return new GoogleOAuthUser(
                readString(attributes, "sub"),
                readString(attributes, "email"),
                readBoolean(attributes, "email_verified"),
                readString(attributes, "name"),
                readString(attributes, "picture")
        );
    }

    private String successRedirectUrl(AuthTokenResponse token, String redirectPath) {
        StringJoiner fragment = new StringJoiner("&");
        fragment.add("accessToken=" + encode(token.getAccessToken()));
        fragment.add("refreshToken=" + encode(token.getRefreshToken()));
        fragment.add("tokenType=" + encode(token.getTokenType()));
        fragment.add("expiresIn=" + token.getExpiresIn());
        fragment.add("refreshExpiresIn=" + token.getRefreshExpiresIn());
        fragment.add("userId=" + token.getUserId());
        fragment.add("username=" + encode(token.getUsername()));
        fragment.add("roles=" + encode(String.join(",", token.getRoles())));
        fragment.add("redirect=" + encode(redirectPath));
        return frontendBaseUrl() + authProperties.getOauth().getGoogle().getSuccessPath() + "#" + fragment;
    }

    private String frontendBaseUrl() {
        String configured = authProperties.getOauth().getGoogle().getFrontendBaseUrl();
        return StringUtils.hasText(configured) ? configured.replaceAll("/+$", "") : "";
    }

    private String failureRedirectUrl(RuntimeException exception) {
        return frontendBaseUrl()
                + authProperties.getOauth().getGoogle().getFailurePath()
                + "?oauth=failed&reason="
                + encode(exception.getMessage() == null ? "google oauth failed" : exception.getMessage());
    }

    private String readString(Map<String, Object> attributes, String key) {
        Object value = attributes.get(key);
        return value instanceof String stringValue ? stringValue : "";
    }

    private boolean readBoolean(Map<String, Object> attributes, String key) {
        Object value = attributes.get(key);
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        return value instanceof String stringValue && Boolean.parseBoolean(stringValue);
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
