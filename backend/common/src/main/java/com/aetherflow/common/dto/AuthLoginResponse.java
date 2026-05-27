package com.aetherflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthLoginResponse {

    private Long userId;
    private String username;
    private List<String> roles;
    private String tokenType;
    private String accessToken;
    private long expiresIn;
}

