package com.aetherflow.workflow.runtime.stream;

import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkflowRuntimeStreamHandshakeInterceptorTest {

    @Test
    void acceptsScopedTokenForAnOwnedWorkflowAndCapturesCursor() throws Exception {
        WorkflowRuntimeStreamTokenService tokenService = new WorkflowRuntimeStreamTokenService(jwtProperties());
        WorkflowStreamTokenResponse token = tokenService.issue(7L, "alice", "1001");
        WorkflowInstanceMapper mapper = mock(WorkflowInstanceMapper.class);
        when(mapper.selectById(1001L)).thenReturn(instance(1001L, 7L));
        WorkflowRuntimeStreamHandshakeInterceptor interceptor =
                new WorkflowRuntimeStreamHandshakeInterceptor(tokenService, mapper);
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                request("/workflow/runtime/ws/1001?streamToken=" + token.token() + "&cursor=event-9"),
                null,
                mock(WebSocketHandler.class),
                attributes
        );

        assertThat(accepted).isTrue();
        assertThat(attributes).containsEntry("userId", 7L)
                .containsEntry("username", "alice")
                .containsEntry("workflowId", "1001")
                .containsEntry("cursor", "event-9");
    }

    @Test
    void rejectsTokenReplayAgainstAnotherWorkflow() throws Exception {
        WorkflowRuntimeStreamTokenService tokenService = new WorkflowRuntimeStreamTokenService(jwtProperties());
        WorkflowStreamTokenResponse token = tokenService.issue(7L, "alice", "1001");
        WorkflowInstanceMapper mapper = mock(WorkflowInstanceMapper.class);
        when(mapper.selectById(1002L)).thenReturn(instance(1002L, 7L));
        WorkflowRuntimeStreamHandshakeInterceptor interceptor =
                new WorkflowRuntimeStreamHandshakeInterceptor(tokenService, mapper);

        boolean accepted = interceptor.beforeHandshake(
                request("/workflow/runtime/ws/1002?streamToken=" + token.token()),
                null,
                mock(WebSocketHandler.class),
                new HashMap<>()
        );

        assertThat(accepted).isFalse();
    }

    @Test
    void rejectsAWorkflowOwnedByAnotherUser() throws Exception {
        WorkflowRuntimeStreamTokenService tokenService = new WorkflowRuntimeStreamTokenService(jwtProperties());
        WorkflowStreamTokenResponse token = tokenService.issue(7L, "alice", "1001");
        WorkflowInstanceMapper mapper = mock(WorkflowInstanceMapper.class);
        when(mapper.selectById(1001L)).thenReturn(instance(1001L, 8L));
        WorkflowRuntimeStreamHandshakeInterceptor interceptor =
                new WorkflowRuntimeStreamHandshakeInterceptor(tokenService, mapper);

        boolean accepted = interceptor.beforeHandshake(
                request("/workflow/runtime/ws/1001?streamToken=" + token.token()),
                null,
                mock(WebSocketHandler.class),
                new HashMap<>()
        );

        assertThat(accepted).isFalse();
    }

    private ServletServerHttpRequest request(String uri) {
        String[] parts = uri.split("\\?", 2);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", parts[0]);
        if (parts.length == 2) {
            request.setQueryString(parts[1]);
        }
        return new ServletServerHttpRequest(request);
    }

    private WorkflowInstance instance(Long id, Long userId) {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(id);
        instance.setUserId(userId);
        return instance;
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
