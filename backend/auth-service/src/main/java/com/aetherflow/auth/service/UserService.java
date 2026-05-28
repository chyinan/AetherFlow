package com.aetherflow.auth.service;

import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;

public interface UserService {

    AuthTokenResponse register(UserRegisterRequest request, AuthRequestContext context);

    AuthTokenResponse login(AuthLoginRequest request, AuthRequestContext context);

    AuthTokenResponse refresh(AuthRefreshRequest request, AuthRequestContext context);

    void logout(AuthLogoutRequest request, AuthRequestContext context);

    AuthMetricsResponse status();

    AuthMetricsResponse metrics();

    UserPrincipalDTO currentUser(Long userId, String username, String roles);
}
