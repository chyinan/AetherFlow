package com.aetherflow.auth.oauth;

public record GoogleOAuthUser(
        String id,
        String email,
        boolean emailVerified,
        String name,
        String avatarUrl
) {
}
