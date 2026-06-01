package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GithubOAuthStateService {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private final AuthProperties authProperties;
    private final ObjectMapper objectMapper;

    public String createState(String redirectPath, String callbackUri) {
        try {
            long expiresAt = Instant.now()
                    .plusSeconds(authProperties.getOauth().getGithub().getStateTtlMinutes() * 60)
                    .toEpochMilli();
            OAuthStatePayload payload = new OAuthStatePayload(
                    UUID.randomUUID().toString(),
                    normalizeRedirectPath(redirectPath),
                    callbackUri,
                    expiresAt);
            String encodedPayload = base64Url(objectMapper.writeValueAsBytes(payload));
            return encodedPayload + "." + sign(encodedPayload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("could not create oauth state", exception);
        }
    }

    public ValidatedState validateState(String state) {
        if (!StringUtils.hasText(state)) {
            throw invalidState();
        }
        String[] parts = state.split("\\.", 2);
        if (parts.length != 2 || !MessageDigest.isEqual(sign(parts[0]).getBytes(StandardCharsets.UTF_8),
                parts[1].getBytes(StandardCharsets.UTF_8))) {
            throw invalidState();
        }
        try {
            OAuthStatePayload payload = objectMapper.readValue(Base64.getUrlDecoder().decode(parts[0]), OAuthStatePayload.class);
            if (payload.expiresAt() < Instant.now().toEpochMilli()) {
                throw invalidState();
            }
            return new ValidatedState(normalizeRedirectPath(payload.redirectPath()), payload.callbackUri());
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidState();
        }
    }

    private String sign(String encodedPayload) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(authProperties.getOauth().getGithub().getStateSecret()
                    .getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            return base64Url(mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalArgumentException("could not sign oauth state", exception);
        }
    }

    private String normalizeRedirectPath(String redirectPath) {
        if (!StringUtils.hasText(redirectPath)) {
            return "/projects";
        }
        String trimmed = redirectPath.trim();
        if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
            return "/projects";
        }
        return trimmed;
    }

    private String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private IllegalArgumentException invalidState() {
        return new IllegalArgumentException("invalid oauth state");
    }

    private record OAuthStatePayload(
            String nonce,
            String redirectPath,
            String callbackUri,
            long expiresAt
    ) {
    }

    public record ValidatedState(
            String redirectPath,
            String callbackUri
    ) {
    }
}
