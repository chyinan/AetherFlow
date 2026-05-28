package com.aetherflow.auth.security;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AuthTokenBundle {

    private String accessToken;
    private String refreshToken;
    private long accessExpiresInSeconds;
    private long refreshExpiresInSeconds;
}
