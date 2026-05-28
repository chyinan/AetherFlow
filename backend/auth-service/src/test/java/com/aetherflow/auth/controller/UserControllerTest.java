package com.aetherflow.auth.controller;

import com.aetherflow.auth.service.UserService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserControllerTest {

    @Test
    void registerReturnsUnifiedResult() {
        UserService userService = mock(UserService.class);
        UserRegisterRequest request = new UserRegisterRequest();
        AuthLoginResponse response = loginResponse();
        when(userService.register(request)).thenReturn(response);
        UserController controller = new UserController(userService);

        Result<AuthLoginResponse> result = controller.register(request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(response);
    }

    @Test
    void loginReturnsUnifiedResult() {
        UserService userService = mock(UserService.class);
        AuthLoginRequest request = new AuthLoginRequest();
        AuthLoginResponse response = loginResponse();
        when(userService.login(request)).thenReturn(response);
        UserController controller = new UserController(userService);

        Result<AuthLoginResponse> result = controller.login(request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(response);
    }

    @Test
    void currentUserRejectsMissingGatewayUserHeader() {
        UserController controller = new UserController(mock(UserService.class));

        assertThatThrownBy(() -> controller.currentUser(null, null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("missing gateway user context");
    }

    @Test
    void currentUserReturnsUnifiedResult() {
        UserService userService = mock(UserService.class);
        UserPrincipalDTO principal = new UserPrincipalDTO(7L, "alice", List.of("USER"));
        when(userService.currentUser(7L, "alice", "USER")).thenReturn(principal);
        UserController controller = new UserController(userService);

        Result<UserPrincipalDTO> result = controller.currentUser(7L, "alice", "USER");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(principal);
    }

    private AuthLoginResponse loginResponse() {
        return new AuthLoginResponse(7L, "alice", List.of("USER"), "Bearer", "token", 7200);
    }
}
