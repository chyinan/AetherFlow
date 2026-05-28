package com.aetherflow.auth.controller;

import com.aetherflow.auth.service.UserService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "User Auth", description = "User registration, login and profile APIs.")
public class UserController {

    private final UserService userService;

    @PostMapping("/register")
    @Operation(summary = "Register a new user and return a JWT.")
    public Result<AuthLoginResponse> register(@Valid @RequestBody UserRegisterRequest request) {
        return Result.success(userService.register(request));
    }

    @PostMapping("/login")
    @Operation(summary = "Login with username and password and return a JWT.")
    public Result<AuthLoginResponse> login(@Valid @RequestBody AuthLoginRequest request) {
        return Result.success(userService.login(request));
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user profile from gateway headers.")
    public Result<UserPrincipalDTO> currentUser(@RequestHeader(value = "X-User-Id", required = false) Long userId,
                                                @RequestHeader(value = "X-Username", required = false) String username,
                                                @RequestHeader(value = "X-Roles", required = false) String roles) {
        if (userId == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "missing gateway user context");
        }
        return Result.success(userService.currentUser(userId, username, roles));
    }
}
