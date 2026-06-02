package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.entity.OAuthAccount;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.OAuthAccountMapper;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenBundle;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GithubOAuthService {

    private static final String PROVIDER_GITHUB = "GITHUB";
    private static final String ENABLED = "ENABLED";
    private static final List<String> DEFAULT_ROLES = List.of("USER");

    private final AuthProperties authProperties;
    private final GithubOAuthClient githubOAuthClient;
    private final GithubOAuthStateService stateService;
    private final OAuthAccountMapper oauthAccountMapper;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final AuthTokenService authTokenService;
    private final AuthSessionService authSessionService;

    public String createAuthorizationUrl(String redirectPath, String callbackUri) {
        AuthProperties.OAuth.Github github = authProperties.getOauth().getGithub();
        if (!StringUtils.hasText(github.getClientId()) || !StringUtils.hasText(github.getClientSecret())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "github oauth is not configured");
        }
        String state = stateService.createState(redirectPath, callbackUri);
        return github.getAuthorizeUri()
                + "?client_id=" + encode(github.getClientId())
                + "&redirect_uri=" + encode(callbackUri)
                + "&scope=" + encode("read:user user:email")
                + "&state=" + encode(state);
    }

    @Transactional(rollbackFor = Exception.class)
    public GithubOAuthLoginResult completeLogin(String code, String state, AuthRequestContext context) {
        if (!StringUtils.hasText(code)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "missing github oauth code");
        }
        GithubOAuthStateService.ValidatedState validatedState = stateService.validateState(state);
        String accessToken = githubOAuthClient.exchangeCode(code, validatedState.callbackUri());
        GithubOAuthUser githubUser = githubOAuthClient.fetchUser(accessToken);
        User user = resolveOrCreateUser(githubUser);
        return new GithubOAuthLoginResult(issueAndStoreTokenPair(user), validatedState.redirectPath());
    }

    private User resolveOrCreateUser(GithubOAuthUser githubUser) {
        OAuthAccount account = oauthAccountMapper.selectOne(new LambdaQueryWrapper<OAuthAccount>()
                .eq(OAuthAccount::getProvider, PROVIDER_GITHUB)
                .eq(OAuthAccount::getProviderUserId, githubUser.id())
                .last("limit 1"));
        if (account != null) {
            User existing = userMapper.selectById(account.getUserId());
            if (existing != null && ENABLED.equals(existing.getStatus())) {
                return existing;
            }
            throw new BusinessException(ResultCode.FORBIDDEN, "github oauth account disabled");
        }

        User user = createUser(githubUser);
        bindOAuthAccount(user, githubUser);
        return user;
    }

    private User createUser(GithubOAuthUser githubUser) {
        LocalDateTime now = LocalDateTime.now();
        User user = new User();
        user.setUsername(uniqueUsername(githubUser.login(), githubUser.id()));
        user.setEmail(uniqueEmail(githubUser));
        user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setStatus(ENABLED);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userMapper.insert(user);
        return user;
    }

    private String uniqueUsername(String preferredUsername, String providerUserId) {
        String baseUsername = StringUtils.hasText(preferredUsername)
                ? preferredUsername.trim().replaceAll("[^A-Za-z0-9_.-]", "-")
                : "github-user";
        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, baseUsername)
                .last("limit 1"));
        if (existing == null) {
            return baseUsername;
        }
        return baseUsername + "-github-" + providerUserId;
    }

    private String uniqueEmail(GithubOAuthUser githubUser) {
        String baseEmail = StringUtils.hasText(githubUser.email())
                ? githubUser.email().trim().toLowerCase(Locale.ROOT)
                : "github-" + githubUser.id() + "@oauth.aetherflow.local";
        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, baseEmail)
                .last("limit 1"));
        if (existing == null) {
            return baseEmail;
        }
        return "github-" + githubUser.id() + "@oauth.aetherflow.local";
    }

    private void bindOAuthAccount(User user, GithubOAuthUser githubUser) {
        LocalDateTime now = LocalDateTime.now();
        OAuthAccount account = new OAuthAccount();
        account.setUserId(user.getId());
        account.setProvider(PROVIDER_GITHUB);
        account.setProviderUserId(githubUser.id());
        account.setProviderUsername(githubUser.login());
        account.setProviderEmail(githubUser.email());
        account.setAvatarUrl(githubUser.avatarUrl());
        account.setCreatedAt(now);
        account.setUpdatedAt(now);
        oauthAccountMapper.insert(account);
    }

    private AuthTokenResponse issueAndStoreTokenPair(User user) {
        blacklistExistingAccessToken(user.getId());
        AuthTokenBundle bundle = authTokenService.issueTokenBundle(user.getId(), user.getUsername(), DEFAULT_ROLES);
        authSessionService.storeSession(user.getId(), bundle.getAccessToken(), authTokenService.accessTokenTtl(),
                bundle.getRefreshToken(), authTokenService.refreshTokenTtl());
        return new AuthTokenResponse(
                user.getId(),
                user.getUsername(),
                DEFAULT_ROLES,
                "Bearer",
                bundle.getAccessToken(),
                bundle.getRefreshToken(),
                bundle.getAccessExpiresInSeconds(),
                bundle.getRefreshExpiresInSeconds()
        );
    }

    private void blacklistExistingAccessToken(Long userId) {
        String existingAccessToken = authSessionService.getAccessToken(userId);
        if (StringUtils.hasText(existingAccessToken)) {
            authSessionService.blacklistToken(existingAccessToken, authTokenService.accessTokenTtl());
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
