package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.http.HttpJsonRequestService;
import com.aetherflow.workflow.node.executor.HttpRequestNodeExecutor;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class HttpRequestNodeRetryTest {
    private static final String URL = "https://example.com/api";
    private static final RetryPolicy RETRIES = RetryPolicy.of(3, Duration.ZERO, 1.0D, Duration.ZERO);
    private HttpJsonRequestService requests;
    private HttpRequestNodeExecutor http;
    private List<RuntimeEvent> events;

    @BeforeEach
    void setUp() {
        requests = mock(HttpJsonRequestService.class);
        http = new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), requests, new ObjectMapper());
        events = Collections.synchronizedList(new ArrayList<>());
    }

    @ParameterizedTest
    @MethodSource("failedResponses")
    void failedHttpResponseIsNeverAutomaticallyReplayed(String method, HttpJsonRequestService.Response response) {
        when(requests.request(URL, method, null, false)).thenReturn(response);

        assertThatThrownBy(() -> engine(http).execute(request(
                node("http", "HTTP_REQUEST", Map.of("url", URL, "method", method)))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(response.error());

        verify(requests).request(URL, method, null, false);
        verifyNoMoreInteractions(requests);
        assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.NODE_RETRYING);
        assertThat(events).anyMatch(event -> event.eventType() == RuntimeEventType.WORKFLOW_FAILED);
    }

    private static Stream<Arguments> failedResponses() {
        return Stream.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE").flatMap(method -> Stream.of(
                // 非 2xx、写入已完成但响应格式错误、超时导致结果未知，都不能触发隐式重放。
                new HttpJsonRequestService.Response(503, null, "unavailable", false, "HTTP_STATUS_ERROR"),
                new HttpJsonRequestService.Response(200, null, "not json", false, "INVALID_JSON_RESPONSE"),
                new HttpJsonRequestService.Response(0, null, "", false, "HTTP_REQUEST_FAILED")
        ).map(response -> Arguments.of(method, response)));
    }

    @Test
    void unexpectedTransportExceptionDoesNotReplayPost() {
        IllegalStateException failure = new IllegalStateException("连接中断，远端执行结果未知");
        when(requests.request(URL, "POST", null, false)).thenThrow(failure);

        assertThatThrownBy(() -> engine(http).execute(request(
                node("http", "HTTP_REQUEST", Map.of("url", URL, "method", "POST")))))
                .isSameAs(failure);

        verify(requests).request(URL, "POST", null, false);
        verifyNoMoreInteractions(requests);
        assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.NODE_RETRYING);
    }

    @Test
    void nestedHttpFailureDoesNotReplayPost() {
        when(requests.request(URL, "POST", null, false)).thenReturn(
                new HttpJsonRequestService.Response(0, null, "", false, "HTTP_REQUEST_FAILED"));
        WorkflowNodeDTO iteration = node("batch", "ITERATION", Map.of(
                "inputVariable", "items",
                "bodyNodes", List.of(Map.of("nodeId", "http", "nodeType", "HTTP_REQUEST",
                        "config", Map.of("url", URL, "method", "POST")))));
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("http-nested-retry-test");
        definition.setNodes(List.of(iteration));
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-nested", "trace-nested", "task-nested", definition,
                Map.of("items", List.of("one")), RETRIES);

        assertThatThrownBy(() -> engine(http).execute(request))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("HTTP_REQUEST_FAILED");

        verify(requests).request(URL, "POST", null, false);
        verifyNoMoreInteractions(requests);
        assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.NODE_RETRYING);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void explicitHttpBranchStillRunsOnceAndSelectsOnlyItsDestination(boolean ok) {
        when(requests.request(URL, "POST", null, false)).thenReturn(
                new HttpJsonRequestService.Response(ok ? 200 : 0, null, "", ok, ok ? "" : "HTTP_REQUEST_FAILED"));
        List<String> selected = Collections.synchronizedList(new ArrayList<>());
        NodeExecutor destination = new NodeExecutor() {
            @Override public NodeType nodeType() { return NodeType.of("DESTINATION"); }
            @Override public NodeResult execute(WorkflowContext context) {
                selected.add(context.currentNodeId());
                return NodeResult.success(Map.of());
            }
        };

        WorkflowExecutionSnapshot snapshot = engine(http, destination).execute(request(
                node("http", "HTTP_REQUEST", Map.of("url", URL, "method", "POST", "errorStrategy", "BRANCH",
                        "branches", Map.of("success", "success", "error", "error"))),
                node("success", "DESTINATION", Map.of("nextNodes", List.of())),
                node("error", "DESTINATION", Map.of("nextNodes", List.of()))));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(selected).containsExactly(ok ? "success" : "error");
        assertThat(snapshot.nodeOutputs().get("http").output()).containsEntry("httpOk", ok);
        verify(requests).request(URL, "POST", null, false);
        verifyNoMoreInteractions(requests);
        assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.NODE_RETRYING);
    }

    @Test
    void successfulPostStillCompletesOnce() {
        when(requests.request(URL, "POST", null, false)).thenReturn(
                new HttpJsonRequestService.Response(201, Map.of("id", 7), "{\"id\":7}", true, ""));

        WorkflowExecutionSnapshot snapshot = engine(http).execute(request(
                node("http", "HTTP_REQUEST", Map.of("url", URL, "method", "POST"))));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.nodeOutputs().get("http").output()).containsEntry("httpStatusCode", 201);
        verify(requests).request(URL, "POST", null, false);
        verifyNoMoreInteractions(requests);
    }

    @Test
    void otherNodeTypesKeepTheirExistingRetryPolicy() {
        AtomicInteger attempts = new AtomicInteger();
        NodeExecutor unstable = new NodeExecutor() {
            @Override public NodeType nodeType() { return NodeType.of("UNSTABLE"); }
            @Override public NodeResult execute(WorkflowContext context) {
                if (attempts.incrementAndGet() < 3) throw new IllegalStateException("暂时失败");
                return NodeResult.success(Map.of());
            }
        };

        WorkflowExecutionSnapshot snapshot = engine(unstable).execute(request(
                node("unstable", "UNSTABLE", Map.of())));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(attempts).hasValue(3);
        assertThat(events.stream().filter(event -> event.eventType() == RuntimeEventType.NODE_RETRYING))
                .hasSize(2);
    }

    private WorkflowRuntimeEngine engine(NodeExecutor... executors) {
        return new WorkflowRuntimeEngine(new NodeRegistry(List.of(executors)), new RuntimeStateMachine(),
                events::add, RuntimeSleeper.noop());
    }

    private static WorkflowRuntimeRequest request(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("http-retry-test");
        definition.setNodes(List.of(nodes));
        return new WorkflowRuntimeRequest("workflow-http", "trace-http", "task-http", definition, Map.of(), RETRIES);
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setDisplayName(id);
        node.setConfig(config);
        return node;
    }
}
