package com.aetherflow.notify.service;

import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.notify.dto.StreamTokenResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class StreamTokenHandshakeInterceptorTest {

    @Test
    void acceptsWebSocketHandshakeWithValidStreamTokenQuery() throws Exception {
        StreamTokenService service = new StreamTokenService(jwtProperties());
        StreamTokenResponse token = service.issue(7L, "alice");
        StreamTokenHandshakeInterceptor interceptor = new StreamTokenHandshakeInterceptor(service);
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                request("/notify/ws?streamToken=" + token.token()),
                null,
                mock(WebSocketHandler.class),
                attributes
        );

        assertThat(accepted).isTrue();
        assertThat(attributes).containsEntry("userId", 7L);
        assertThat(attributes).containsEntry("username", "alice");
    }

    @Test
    void rejectsWebSocketHandshakeWithoutValidStreamToken() throws Exception {
        StreamTokenService service = new StreamTokenService(jwtProperties());
        StreamTokenHandshakeInterceptor interceptor = new StreamTokenHandshakeInterceptor(service);

        boolean accepted = interceptor.beforeHandshake(
                request("/notify/ws?userId=7"),
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

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
