package com.aetherflow.auth.controller;

import com.aetherflow.auth.service.AuthService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public Result<AuthLoginResponse> register(@Valid @RequestBody UserRegisterRequest request) {
        return Result.success(authService.register(request));
    }

    @PostMapping("/login")
    public Result<AuthLoginResponse> login(@Valid @RequestBody AuthLoginRequest request) {
        return Result.success(authService.login(request));
    }

    @GetMapping("/me")
    public Result<UserPrincipalDTO> currentUser(@RequestHeader(value = "X-User-Id", required = false) Long userId,
                                                @RequestHeader(value = "X-Username", required = false) String username,
                                                @RequestHeader(value = "X-Roles", required = false) String roles) {
        if (userId == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "missing gateway user context");
        }
        return Result.success(authService.currentUser(userId, username, roles));
    }
}

