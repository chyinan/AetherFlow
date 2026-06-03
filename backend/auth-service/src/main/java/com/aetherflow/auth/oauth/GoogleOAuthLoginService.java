package com.aetherflow.auth.oauth;

import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.entity.OAuthAccount;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.OAuthAccountMapper;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenBundle;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GoogleOAuthLoginService {

    private static final String PROVIDER_GOOGLE = "GOOGLE";
    private static final String ENABLED = "ENABLED";
    private static final List<String> DEFAULT_ROLES = List.of("USER");

    private final OAuthAccountMapper oauthAccountMapper;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final AuthTokenService authTokenService;
    private final AuthSessionService authSessionService;

    @Transactional(rollbackFor = Exception.class)
    public GoogleOAuthLoginResult loginOrRegister(GoogleOAuthUser googleUser) {
        validateGoogleUser(googleUser);
        User user = resolveOrCreateUser(googleUser);
        return new GoogleOAuthLoginResult(issueAndStoreTokenPair(user));
    }

    private User resolveOrCreateUser(GoogleOAuthUser googleUser) {
        OAuthAccount account = oauthAccountMapper.selectOne(new LambdaQueryWrapper<OAuthAccount>()
                .eq(OAuthAccount::getProvider, PROVIDER_GOOGLE)
                .eq(OAuthAccount::getProviderUserId, googleUser.id())
                .last("limit 1"));
        if (account != null) {
            User existing = userMapper.selectById(account.getUserId());
            if (existing != null && ENABLED.equals(existing.getStatus())) {
                return existing;
            }
            throw new BusinessException(ResultCode.FORBIDDEN, "google oauth account disabled");
        }

        User existingByEmail = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, normalizeEmail(googleUser.email()))
                .last("limit 1"));
        if (existingByEmail != null) {
            if (!ENABLED.equals(existingByEmail.getStatus())) {
                throw new BusinessException(ResultCode.FORBIDDEN, "google oauth account disabled");
            }
            bindOAuthAccount(existingByEmail, googleUser);
            return existingByEmail;
        }

        User user = createUser(googleUser);
        bindOAuthAccount(user, googleUser);
        return user;
    }

    private User createUser(GoogleOAuthUser googleUser) {
        LocalDateTime now = LocalDateTime.now();
        User user = new User();
        user.setUsername(uniqueUsername(googleUser));
        user.setEmail(normalizeEmail(googleUser.email()));
        user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setStatus(ENABLED);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userMapper.insert(user);
        return user;
    }

    private String uniqueUsername(GoogleOAuthUser googleUser) {
        String email = normalizeEmail(googleUser.email());
        String baseUsername = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        if (!StringUtils.hasText(baseUsername)) {
            baseUsername = sanitizeUsername(googleUser.name());
        }
        if (!StringUtils.hasText(baseUsername)) {
            baseUsername = "google-user";
        }
        baseUsername = sanitizeUsername(baseUsername);
        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, baseUsername)
                .last("limit 1"));
        if (existing == null) {
            return baseUsername;
        }
        return baseUsername + "-google-" + googleUser.id();
    }

    private String sanitizeUsername(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String sanitized = value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_.-]", "-");
        return sanitized.replaceAll("-+", "-").replaceAll("^-|-$", "");
    }

    private void bindOAuthAccount(User user, GoogleOAuthUser googleUser) {
        LocalDateTime now = LocalDateTime.now();
        OAuthAccount account = new OAuthAccount();
        account.setUserId(user.getId());
        account.setProvider(PROVIDER_GOOGLE);
        account.setProviderUserId(googleUser.id());
        account.setProviderUsername(googleUser.name());
        account.setProviderEmail(normalizeEmail(googleUser.email()));
        account.setAvatarUrl(googleUser.avatarUrl());
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

    private void validateGoogleUser(GoogleOAuthUser googleUser) {
        if (googleUser == null || !StringUtils.hasText(googleUser.id())) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "google user profile is incomplete");
        }
        if (!StringUtils.hasText(googleUser.email())) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "google email is missing");
        }
        if (!googleUser.emailVerified()) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "google email is not verified");
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
