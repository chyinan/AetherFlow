package com.aetherflow.common.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class JwtUserClaims {

    private Long userId;
    private String username;
    private List<String> roles;
}

