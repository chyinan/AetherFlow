package com.aetherflow.auth.controller;

// pattern: Imperative Shell

import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.dto.OAuthSessionCompletionRequest;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.service.UserService;
import com.aetherflow.auth.web.OAuthBrowserStateService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtUserClaims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/auth/oauth")
@RequiredArgsConstructor
public class OAuthSessionController {

    private final AuthTokenService authTokenService;
    private final UserService userService;
    private final OAuthBrowserStateService browserStateService;

    @PostMapping("/complete")
    public Result<AuthTokenResponse> complete(
            @Valid @RequestBody OAuthSessionCompletionRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        String accessToken = request.getAccessToken().trim();
        JwtUserClaims claims = authTokenService.parseAccessToken("Bearer " + accessToken);
        if (!browserStateService.consume(request.getProvider(), request.getState(), servletRequest, servletResponse)) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "oauth browser state is invalid");
        }

        UserPrincipalDTO profile = userService.profile(claims.getUserId());
        Duration remaining = authTokenService.accessTokenRemainingTtl("Bearer " + accessToken);
        long expiresIn = Math.max(1L, remaining.getSeconds());
        return Result.success(new AuthTokenResponse(
                profile.getUserId(),
                profile.getUsername(),
                profile.getRoles(),
                "Bearer",
                accessToken,
                null,
                expiresIn,
                authTokenService.refreshTokenTtl().getSeconds()
        ));
    }
}
