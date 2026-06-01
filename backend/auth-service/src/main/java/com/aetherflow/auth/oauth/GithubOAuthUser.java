package com.aetherflow.auth.oauth;

public record GithubOAuthUser(
        String id,
        String login,
        String name,
        String email,
        String avatarUrl
) {
}
