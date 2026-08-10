package com.aetherflow.auth.controller;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.common.core.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// pattern: Imperative Shell
@RestController
@RequestMapping("/auth/oauth")
@RequiredArgsConstructor
@Tag(name = "OAuth Providers", description = "Public availability of configured OAuth login providers.")
public class OAuthProviderController {

    private final AuthProperties authProperties;

    @GetMapping("/providers")
    @Operation(summary = "Get OAuth provider availability")
    public Result<OAuthProviderAvailability> providers() {
        AuthProperties.OAuth.Github github = authProperties.getOauth().getGithub();
        AuthProperties.OAuth.Google google = authProperties.getOauth().getGoogle();
        return Result.success(new OAuthProviderAvailability(
                StringUtils.hasText(github.getClientId()) && StringUtils.hasText(github.getClientSecret()),
                StringUtils.hasText(google.getClientId()) && StringUtils.hasText(google.getClientSecret())
        ));
    }

    public record OAuthProviderAvailability(
            boolean githubConfigured,
            boolean googleConfigured
    ) {
    }
}
