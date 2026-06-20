package com.aetherflow.common.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserRegisterRequest {

    @NotBlank
    @Size(max = 64)
    private String username;

    @Email
    @NotBlank
    @Size(max = 255)
    private String email;

    /**
     * Password must be at least 8 characters long and contain at least one letter
     * and one digit. Stronger requirements (mixed case, special characters) are
     * intentionally avoided to stay user-friendly; enforce additional policy at the
     * frontend if needed.
     */
    @NotBlank
    @Size(min = 8, max = 128)
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
            message = "password must contain at least one letter and one digit")
    private String password;
}

