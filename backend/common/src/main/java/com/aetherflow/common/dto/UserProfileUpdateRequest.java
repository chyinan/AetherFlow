package com.aetherflow.common.dto;

// pattern: Functional Core

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserProfileUpdateRequest {

    @Size(min = 3, max = 64)
    private String username;

    @Email
    @Size(max = 255)
    private String email;

    @Size(min = 8, max = 128)
    private String currentPassword;

    @Size(min = 8, max = 128)
    private String newPassword;
}
