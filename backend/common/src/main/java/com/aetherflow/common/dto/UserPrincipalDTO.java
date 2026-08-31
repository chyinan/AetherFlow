package com.aetherflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserPrincipalDTO {

    private Long userId;
    private String username;
    private String email;
    private List<String> roles;

    public UserPrincipalDTO(Long userId, String username, List<String> roles) {
        this(userId, username, null, roles);
    }
}

