package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.http.HttpJsonRequestService;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class HttpRequestNodeExecutorTest {
    private HttpJsonRequestService requests;
    private HttpRequestNodeExecutor executor;

    @BeforeEach void setup() {
        requests = mock(HttpJsonRequestService.class);
        executor = new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), requests, new ObjectMapper());
    }

    @Test void bindsUrlAndBodyVariablesAndOutputsParsedResponse() throws Exception {
        when(requests.request("https://example.com/api", "POST", Map.of("q", "hello"), true))
                .thenReturn(new HttpJsonRequestService.Response(201, Map.of("id", 7), "{\"id\":7}", true, ""));
        var result = executor.execute(context(Map.of("requestUrl", "https://example.com/api", "payload", Map.of("q", "hello")),
                Map.of("method", "POST", "bodyVariable", "payload", "outputVariable", "created")));
        assertThat(result.successful()).isTrue();
        assertThat(result.branchKey()).isNull();
        assertThat(result.variables().get("httpStatusCode")).isEqualTo(201);
        assertThat(((Map<?, ?>) result.variables().get("created")).get("body")).isEqualTo(Map.of("id", 7));
    }

    @Test void sendsLiteralJsonIncludingNull() throws Exception {
        when(requests.request("https://example.com/api", "POST", null, true))
                .thenReturn(new HttpJsonRequestService.Response(204, null, "", true, ""));
        var result = executor.execute(context(Map.of(), Map.of("url", "https://example.com/api", "method", "POST", "bodyJson", "null")));
        assertThat(((Map<?, ?>) result.variables().get("httpResponse")).get("body")).isNull();
        verify(requests).request("https://example.com/api", "POST", null, true);
    }

    @Test void failsWorkflowByDefault() {
        when(requests.request("https://example.com/api", "GET", null, false))
                .thenReturn(new HttpJsonRequestService.Response(503, null, "maintenance", false, "HTTP_STATUS_ERROR"));
        assertThatThrownBy(() -> executor.execute(context(Map.of(), Map.of("url", "https://example.com/api"))))
                .isInstanceOf(BusinessException.class).hasMessageContaining("503");
    }

    @Test void selectsExplicitSuccessAndErrorBranches() throws Exception {
        Map<String, Object> config = Map.of("url", "https://example.com/api", "errorStrategy", "BRANCH",
                "branches", Map.of("success", "next", "error", "recover"));
        for (boolean ok : new boolean[]{true, false}) {
            when(requests.request("https://example.com/api", "GET", null, false))
                    .thenReturn(new HttpJsonRequestService.Response(ok ? 200 : 0, null, "", ok, ok ? "" : "HTTP_REQUEST_FAILED"));
            var result = executor.execute(context(Map.of(), config));
            assertThat(result.branchKey()).isEqualTo(ok ? "success" : "error");
            assertThat(result.successful()).isTrue();
            assertThat(result.variables().get("httpOk")).isEqualTo(ok);
        }
    }

    @Test void rejectsIncompleteBranchAndInvalidBodyConfigurationWithoutRequesting() {
        for (Map<String, Object> config : java.util.List.<Map<String, Object>>of(
                Map.of("url", "https://example.com/api", "errorStrategy", "BRANCH", "branches", Map.of("success", "next")),
                Map.of("url", "https://example.com/api", "method", "POST", "bodyJson", "not json"),
                Map.of("url", "https://example.com/api", "method", "POST", "bodyJson", "{} {}"),
                Map.of("url", "https://example.com/api", "bodyVariable", "missing"),
                Map.of("url", "https://example.com/api", "bodyVariable", "payload", "bodyJson", "{}"))) {
            assertThatThrownBy(() -> executor.execute(context(Map.of(), config))).isInstanceOf(BusinessException.class);
        }
        verifyNoInteractions(requests);
    }

    private static DefaultWorkflowContext context(Map<String, Object> variables, Map<String, Object> config) {
        Map<String, Object> initial = new LinkedHashMap<>(variables);
        initial.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("http", config));
        var context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initial);
        context.updateCurrentNodeId("http");
        return context;
    }
}
