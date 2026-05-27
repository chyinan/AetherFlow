package com.aetherflow.auth.service.impl;

import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.service.AuthService;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private static final String ENABLED = "ENABLED";
    private static final List<String> DEFAULT_ROLES = List.of("USER");

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AuthLoginResponse register(UserRegisterRequest request) {
        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, request.getUsername())
                .last("limit 1"));
        if (existing != null) {
            throw new BusinessException(ResultCode.CONFLICT, "username already exists");
        }

        User user = new User();
        user.setUsername(request.getUsername());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setStatus(ENABLED);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.insert(user);
        return issueToken(user);
    }

    @Override
    public AuthLoginResponse login(AuthLoginRequest request) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, request.getUsername())
                .last("limit 1"));
        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "invalid username or password");
        }
        if (!ENABLED.equals(user.getStatus())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "user disabled");
        }
        return issueToken(user);
    }

    @Override
    public UserPrincipalDTO currentUser(Long userId, String username, String roles) {
        List<String> roleList = roles == null || roles.isBlank()
                ? DEFAULT_ROLES
                : Arrays.stream(roles.split(",")).filter(role -> !role.isBlank()).toList();
        return new UserPrincipalDTO(userId, username, roleList);
    }

    private AuthLoginResponse issueToken(User user) {
        JwtUserClaims claims = new JwtUserClaims(user.getId(), user.getUsername(), DEFAULT_ROLES);
        String token = jwtTokenProvider.createToken(claims);
        return new AuthLoginResponse(
                user.getId(),
                user.getUsername(),
                DEFAULT_ROLES,
                "Bearer",
                token,
                jwtProperties.getExpireMinutes() * 60
        );
    }
}

