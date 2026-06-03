package com.aetherflow.auth.oauth;

import com.aetherflow.auth.dto.AuthTokenResponse;

public record GoogleOAuthLoginResult(AuthTokenResponse tokenResponse) {
}
