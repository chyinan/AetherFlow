package com.aetherflow.auth.service.impl;

import com.aetherflow.auth.audit.LoginAuditService;
import com.aetherflow.auth.audit.LoginStatus;
import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.exception.UnauthorizedException;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenBundle;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.security.LoginSecurityService;
import com.aetherflow.auth.service.UserService;
import com.aetherflow.auth.session.AuthMetricsSnapshot;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtUserClaims;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private static final String ENABLED = "ENABLED";
    private static final List<String> DEFAULT_ROLES = List.of("USER");

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final AuthTokenService authTokenService;
    private final AuthSessionService authSessionService;
    private final LoginSecurityService loginSecurityService;
    private final LoginAuditService loginAuditService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AuthTokenResponse register(UserRegisterRequest request, AuthRequestContext context) {
        String username = normalizeUsername(request.getUsername());
        String email = normalizeEmail(request.getEmail());
        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username)
                .last("limit 1"));
        if (existing != null) {
            throw new BusinessException(ResultCode.CONFLICT, "username already exists");
        }
        User existingEmail = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, email)
                .last("limit 1"));
        if (existingEmail != null) {
            throw new BusinessException(ResultCode.CONFLICT, "email already exists");
        }

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setStatus(ENABLED);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        try {
            userMapper.insert(user);
        } catch (DuplicateKeyException exception) {
            // Defense-in-depth against the TOCTOU window between the selectOne check
            // above and the insert: the unique indexes uk_af_user_username and
            // uk_af_user_email (see docker/mysql/init/01-aetherflow.sql) enforce
            // uniqueness at the DB layer and raise this exception on a race. Re-check
            // which column collided so we return a precise error to the client.
            User existingUser = userMapper.selectOne(new LambdaQueryWrapper<User>()
                    .eq(User::getUsername, username)
                    .last("limit 1"));
            if (existingUser != null) {
                throw new BusinessException(ResultCode.CONFLICT, "username already exists");
            }
            throw new BusinessException(ResultCode.CONFLICT, "email already exists");
        }
        return issueAndStoreTokenPair(user, false);
    }

    @Override
    public AuthTokenResponse login(AuthLoginRequest request, AuthRequestContext context) {
        String loginName = normalizeUsername(request.getUsername());
        String loginKey = normalizeEmail(loginName);
        loginSecurityService.checkLoginRateLimit(context.clientIp());
        loginSecurityService.checkPasswordFailures(loginKey);

        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, loginName)
                .or()
                .eq(User::getEmail, loginKey)
                .last("limit 1"));
        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            loginAuditService.record(user == null ? null : user.getId(), loginName,
                    context.clientIp(), context.userAgent(), LoginStatus.FAILURE);
            loginSecurityService.recordPasswordFailure(loginKey);
            throw new UnauthorizedException("invalid username or password");
        }
        if (!ENABLED.equals(user.getStatus())) {
            loginAuditService.record(user.getId(), user.getUsername(),
                    context.clientIp(), context.userAgent(), LoginStatus.DISABLED);
            throw new BusinessException(ResultCode.FORBIDDEN, "user disabled");
        }

        loginSecurityService.clearPasswordFailures(loginKey);
        AuthTokenResponse response = issueAndStoreTokenPair(user, true);
        loginAuditService.record(user.getId(), user.getUsername(),
                context.clientIp(), context.userAgent(), LoginStatus.SUCCESS);
        return response;
    }

    @Override
    public AuthTokenResponse refresh(AuthRefreshRequest request, AuthRequestContext context) {
        JwtUserClaims claims = authTokenService.parseRefreshToken(request.getRefreshToken());
        User user = userMapper.selectById(claims.getUserId());
        if (user == null) {
            throw new UnauthorizedException("invalid refresh token");
        }
        if (!ENABLED.equals(user.getStatus())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "user disabled");
        }
        if (!authSessionService.isRefreshTokenActive(user.getId(), request.getRefreshToken())) {
            throw new UnauthorizedException("refresh token expired or revoked");
        }
        return issueAndStoreTokenPair(user, true);
    }

    @Override
    public void logout(AuthLogoutRequest request, AuthRequestContext context) {
        JwtUserClaims claims = authTokenService.parseRefreshToken(request.getRefreshToken());
        Long userId = claims.getUserId();
        if (!authSessionService.isRefreshTokenActive(userId, request.getRefreshToken())) {
            throw new UnauthorizedException("refresh token expired or revoked");
        }
        String storedAccessToken = authSessionService.getAccessToken(userId);
        blacklistLogoutAccessTokens(storedAccessToken, request.getAccessToken());
        authSessionService.deleteSession(userId);
    }

    @Override
    public AuthMetricsResponse status() {
        return metrics();
    }

    @Override
    public AuthMetricsResponse metrics() {
        AuthMetricsSnapshot snapshot = authSessionService.metrics();
        return new AuthMetricsResponse(snapshot.getOnlineUserCount(),
                snapshot.getTokenCount(),
                snapshot.getLoginFailureCount());
    }

    @Override
    public UserPrincipalDTO currentUser(Long userId, String username, String roles) {
        List<String> roleList = Arrays.stream(roles.split(","))
                .map(String::trim)
                .filter(role -> !role.isBlank())
                .toList();
        return new UserPrincipalDTO(userId, username, roleList);
    }

    private AuthTokenResponse issueAndStoreTokenPair(User user, boolean invalidatePreviousAccessToken) {
        if (invalidatePreviousAccessToken) {
            blacklistExistingAccessToken(user.getId());
        }
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
            blacklistAccessToken(existingAccessToken);
        }
    }

    private void blacklistLogoutAccessTokens(String storedAccessToken, String requestAccessToken) {
        if (StringUtils.hasText(storedAccessToken)) {
            blacklistAccessToken(storedAccessToken);
        }
        if (StringUtils.hasText(requestAccessToken)
                && !normalizeToken(requestAccessToken).equals(normalizeToken(storedAccessToken))) {
            blacklistAccessToken(requestAccessToken);
        }
    }

    private String normalizeToken(String token) {
        if (!StringUtils.hasText(token)) {
            return "";
        }
        String value = token.trim();
        return value.startsWith("Bearer ") ? value.substring("Bearer ".length()) : value;
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim();
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private void blacklistAccessToken(String accessToken) {
        Duration ttl = authTokenService.accessTokenTtl();
        try {
            Duration remainingTtl = authTokenService.accessTokenRemainingTtl(accessToken);
            if (!remainingTtl.isZero() && !remainingTtl.isNegative()) {
                ttl = remainingTtl;
            }
        } catch (RuntimeException exception) {
            log.warn("access token ttl resolve failed, fallback to default ttl reason={}: {}",
                    exception.getClass().getSimpleName(), exception.getMessage());
        }
        authSessionService.blacklistToken(accessToken, ttl);
    }
}
