package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GithubOAuthStateService {

    private static final String HMAC_SHA256 = "HmacSHA256";
    public static final String BROWSER_COOKIE_NAME = "aetherflow_github_oauth_state";
    private static final String STATE_PREFIX = "auth:oauth2:github:state:";
    private static final DefaultRedisScript<Long> CONSUME_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('del', KEYS[1]); else return 0; end",
            Long.class);

    private final AuthProperties authProperties;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final Set<String> localNonces = ConcurrentHashMap.newKeySet();

    public GithubOAuthStateService(AuthProperties authProperties, ObjectMapper objectMapper) {
        this(authProperties, objectMapper, null);
    }

    @Autowired
    public GithubOAuthStateService(AuthProperties authProperties,
                                   ObjectMapper objectMapper,
                                   StringRedisTemplate redisTemplate) {
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
    }

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
            storeNonce(payload.nonce());
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
            return new ValidatedState(payload.nonce(), normalizeRedirectPath(payload.redirectPath()), payload.callbackUri());
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidState();
        }
    }

    public ValidatedState consumeState(String state) {
        ValidatedState validated = validateState(state);
        boolean consumed;
        if (redisTemplate == null) {
            consumed = localNonces.remove(validated.nonce());
        } else {
            Long result = redisTemplate.execute(CONSUME_SCRIPT,
                    List.of(key(validated.nonce())), "1");
            consumed = Long.valueOf(1L).equals(result);
        }
        if (!consumed) {
            throw invalidState();
        }
        return validated;
    }

    private void storeNonce(String nonce) {
        if (redisTemplate == null) {
            localNonces.add(nonce);
            return;
        }
        redisTemplate.opsForValue().set(key(nonce), "1",
                java.time.Duration.ofMinutes(authProperties.getOauth().getGithub().getStateTtlMinutes()));
    }

    private String key(String nonce) {
        return STATE_PREFIX + nonce;
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
            String nonce,
            String redirectPath,
            String callbackUri
    ) {
    }
}
