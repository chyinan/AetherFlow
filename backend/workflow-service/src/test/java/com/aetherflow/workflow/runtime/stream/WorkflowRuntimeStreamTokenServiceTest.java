package com.aetherflow.workflow.runtime.stream;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowRuntimeStreamTokenServiceTest {

    @Test
    void issuesAShortLivedTokenScopedToOneWorkflow() {
        WorkflowRuntimeStreamTokenService service = new WorkflowRuntimeStreamTokenService(jwtProperties());

        WorkflowStreamTokenResponse response = service.issue(7L, "alice", "1001");
        WorkflowRuntimeStreamTokenService.StreamTokenClaims claims = service.validate(response.token(), "1001");

        assertThat(response.workflowId()).isEqualTo("1001");
        assertThat(response.expiresInSeconds()).isEqualTo(60L);
        assertThat(response.transports()).containsExactly("workflow-runtime-websocket");
        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.username()).isEqualTo("alice");
        assertThat(claims.workflowId()).isEqualTo("1001");
    }

    @Test
    void rejectsAValidTokenWhenUsedForAnotherWorkflow() {
        WorkflowRuntimeStreamTokenService service = new WorkflowRuntimeStreamTokenService(jwtProperties());
        WorkflowStreamTokenResponse response = service.issue(7L, "alice", "1001");

        assertThatThrownBy(() -> service.validate(response.token(), "1002"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid workflow stream token");
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
