package com.aetherflow.auth.service;

import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;

public interface AuthService {

    AuthLoginResponse register(UserRegisterRequest request);

    AuthLoginResponse login(AuthLoginRequest request);

    UserPrincipalDTO currentUser(Long userId, String username, String roles);
}

