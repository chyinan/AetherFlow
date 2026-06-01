package com.aetherflow.auth.oauth;

import com.aetherflow.auth.dto.AuthTokenResponse;

public record GithubOAuthLoginResult(
        AuthTokenResponse tokenResponse,
        String redirectPath
) {
}
