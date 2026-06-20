package com.aetherflow.common.security;

import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Set;

/**
 * Fail-fast validator for JWT-related secrets owned by JwtProperties and AuthProperties.
 *
 * <p>The default application.yml deliberately leaves the secret blank; the dev profile
 * fills in a known short dev value, while the prod profile requires the JWT_SECRET env
 * var (no fallback). To guarantee a weak or default secret can never be used outside dev,
 * every JwtTokenProvider / AuthTokenService construction site runs this validator with
 * the active Spring environment. In any non-dev (and non-test) profile, a blank, weak
 * default, or too-short secret causes the application context to fail loading.
 */
public final class JwtSecretValidator {

    /** Minimum secret length in characters (HMAC-SHA256 requires at least 256 bits = 32 bytes). */
    public static final int MIN_SECRET_BYTES = 32;

    public static final String DEV_PROFILE = "dev";
    public static final String TEST_PROFILE = "test";

    /** Known weak placeholder values that must never be used outside the dev/test profile. */
    static final Set<String> KNOWN_DEFAULT_SECRETS = Set.of(
            "aetherflow-dev-secret-key-change-me-32bytes-minimum",
            "aetherflow-refresh-secret-change-me-32bytes-minimum",
            "aetherflow-access-secret-change-me-32bytes",
            "aetherflow-test-secret-key-change-me-32bytes",
            "aetherflow-test-secret-key-change-me-32bytes-minimum",
            "aetherflow-github-oauth-state-secret-32bytes"
    );

    private JwtSecretValidator() {
    }

    /**
     * Validate a single JWT-related secret.
     *
     * @param secret      the secret value resolved from configuration
     * @param environment the active Spring environment (may be {@code null} in unit tests,
     *                    in which case validation is skipped to keep test fixtures simple)
     * @param propertyKey the configuration key used in error messages, e.g.
     *                    {@code aetherflow.security.jwt.secret}
     */
    public static void validate(String secret, Environment environment, String propertyKey) {
        if (environment == null) {
            // Unit tests constructing providers directly are not subject to fail-fast checks.
            return;
        }
        if (!shouldEnforceStrongSecret(environment)) {
            return;
        }
        String profiles = Arrays.toString(environment.getActiveProfiles());
        if (!StringUtils.hasText(secret)) {
            throw new IllegalStateException(propertyKey
                    + " is blank. Generate a strong random key (>= " + MIN_SECRET_BYTES
                    + " bytes) and set the corresponding environment variable before starting "
                    + "the service. Active profiles: " + profiles);
        }
        if (secret.length() < MIN_SECRET_BYTES) {
            throw new IllegalStateException(propertyKey
                    + " is shorter than " + MIN_SECRET_BYTES + " bytes, which is too weak for "
                    + "HMAC-SHA256 signing. Generate a stronger key. Active profiles: " + profiles);
        }
        if (KNOWN_DEFAULT_SECRETS.contains(secret)) {
            throw new IllegalStateException(propertyKey
                    + " is set to a known weak default value. Generate a unique strong random key "
                    + "and set it via the corresponding environment variable. Active profiles: "
                    + profiles);
        }
    }

    /**
     * Strong-secret enforcement is applied only when at least one non-dev, non-test profile is
     * explicitly active. Local runs with no active profile (relying on
     * {@code spring.profiles.default=dev}) are treated as dev.
     */
    private static boolean shouldEnforceStrongSecret(Environment environment) {
        String[] active = environment.getActiveProfiles();
        if (active == null || active.length == 0) {
            return false;
        }
        for (String profile : active) {
            if (DEV_PROFILE.equalsIgnoreCase(profile) || TEST_PROFILE.equalsIgnoreCase(profile)) {
                return false;
            }
        }
        return true;
    }
}
