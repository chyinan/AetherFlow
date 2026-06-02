package com.aetherflow.auth.controller;

import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.service.UserService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Tag(name = "User Auth", description = "Enterprise user authentication, token lifecycle and session governance APIs.")
public class UserController {

    private final UserService userService;

    @PostMapping("/register")
    @Operation(summary = "Register user", description = "Creates an ENABLED user account, signs access and refresh tokens, and stores the Redis session.")
    public Result<AuthTokenResponse> register(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "Registration payload.",
                    required = true,
                    content = @Content(schema = @Schema(implementation = UserRegisterRequest.class),
                            examples = @ExampleObject(value = "{\"username\":\"alice\",\"email\":\"alice@aetherflow.local\",\"password\":\"Password123\"}")))
            @Valid @RequestBody UserRegisterRequest request,
                                              HttpServletRequest servletRequest) {
        return Result.success(userService.register(request, AuthRequestContext.from(servletRequest)));
    }

    @PostMapping("/login")
    @Operation(summary = "Login user", description = "Authenticates username and password, applies Redis login limits, records login audit logs, and returns a token pair.")
    public Result<AuthTokenResponse> login(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "Login payload.",
                    required = true,
                    content = @Content(schema = @Schema(implementation = AuthLoginRequest.class),
                            examples = @ExampleObject(value = "{\"username\":\"alice\",\"password\":\"Password123\"}")))
            @Valid @RequestBody AuthLoginRequest request,
                                           HttpServletRequest servletRequest) {
        return Result.success(userService.login(request, AuthRequestContext.from(servletRequest)));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh token pair", description = "Validates the Redis refresh session, rotates refresh token, blacklists the previous access token, and returns a new token pair.")
    public Result<AuthTokenResponse> refresh(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "Refresh token payload.",
                    required = true,
                    content = @Content(schema = @Schema(implementation = AuthRefreshRequest.class),
                            examples = @ExampleObject(value = "{\"refreshToken\":\"eyJhbGciOiJIUzI1NiJ9.refresh\"}")))
            @Valid @RequestBody AuthRefreshRequest request,
                                             HttpServletRequest servletRequest) {
        return Result.success(userService.refresh(request, AuthRequestContext.from(servletRequest)));
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout user", description = "Revokes the current access token, removes the Redis refresh session, and makes the user offline.")
    public Result<Void> logout(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "Logout token payload.",
                    required = true,
                    content = @Content(schema = @Schema(implementation = AuthLogoutRequest.class),
                            examples = @ExampleObject(value = "{\"accessToken\":\"eyJhbGciOiJIUzI1NiJ9.access\",\"refreshToken\":\"eyJhbGciOiJIUzI1NiJ9.refresh\"}")))
            @Valid @RequestBody AuthLogoutRequest request,
                               HttpServletRequest servletRequest) {
        userService.logout(request, AuthRequestContext.from(servletRequest));
        return Result.success();
    }

    @GetMapping("/status")
    @Operation(summary = "Auth service status", description = "Returns online user count, active token count and login failure count from Redis.")
    public Result<AuthMetricsResponse> status() {
        return Result.success(userService.status());
    }

    @GetMapping("/metrics")
    @Operation(summary = "Auth service metrics", description = "Returns auth session governance metrics from Redis.")
    public Result<AuthMetricsResponse> metrics() {
        return Result.success(userService.metrics());
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user", description = "Returns the current user profile from gateway-propagated user headers.")
    public Result<UserPrincipalDTO> currentUser(
            @Parameter(description = "User id forwarded by gateway.", example = "7")
            @NotNull @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Username forwarded by gateway.", example = "alice")
            @NotBlank @RequestHeader(value = "X-Username", required = false) String username,
            @Parameter(description = "Comma-separated roles forwarded by gateway.", example = "USER,ADMIN")
            @NotBlank @RequestHeader(value = "X-Roles", required = false) String roles) {
        return Result.success(userService.currentUser(userId, username, roles));
    }
}
