package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.http.HttpJsonRequestService;
import com.aetherflow.workflow.ingestion.url.UrlIngestionProperties;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.code.CodeExecutionRuntime;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** 受控 HTTP/代码运行时替身，只验执行器契约，不宣称完成真实沙箱验收。 */
class CustomNodeExecutorTest {
    static final class FakeHttp extends HttpJsonRequestService {
        int calls; Object body; Response response = new Response(200, Map.of("total", 8), "", true, "");
        FakeHttp() { super(new UrlIngestionProperties(), null, new ObjectMapper(), null); }
        @Override public Response request(String url, String method, Object body, boolean hasBody, Map<String, String> headers) {
            assertThat(url).isEqualTo("https://example.com/api"); calls++; this.body = body; return response;
        }
        @Override public Response request(String url, String method, Object body, boolean hasBody) { return request(url, method, body, hasBody, Map.of()); }
    }
    static final class FakeRuntime implements CodeExecutionRuntime {
        int calls, timeout, bytes; Object input;
        @Override public CodeExecutionResult execute(String language, String code, Object input, int timeout, int bytes) {
            assertThat(language).isEqualTo("python3"); assertThat(code).contains("def main");
            calls++; this.input = input; this.timeout = timeout; this.bytes = bytes;
            return new CodeExecutionResult(Map.of("total", 8), "debug", 4, false);
        }
    }
    private Map<String, Object> definition(String kind) {
        var definition = new LinkedHashMap<String, Object>(Map.of("formatVersion", 1, "id", "custom-test", "version", "1.0.0", "name", "测试", "kind", kind,
                "inputs", List.of(Map.of("name", "count", "type", "NUMBER", "required", true)), "fields", List.of(),
                "outputs", List.of(Map.of("name", "myTotal", "type", "NUMBER", "required", true, "path", "/total"))));
        if (kind.equals("CODE")) definition.put("code", "def main(payload): return {'total': payload['inputs']['count'] * 2}");
        else definition.put("request", Map.of("url", "https://example.com/api", "method", "POST", "headers", Map.of(), "body", Map.of("count", "{{inputs.count}}")));
        return definition;
    }
    private DefaultWorkflowContext context(String kind) { return context(kind, Map.of()); }
    private DefaultWorkflowContext context(String kind, Map<String, Object> extra) {
        var config = new LinkedHashMap<String, Object>(Map.of("customDefinition", definition(kind), "inputBindings", Map.of("count", "quantity"))); config.putAll(extra); return withConfig(config);
    }
    private DefaultWorkflowContext withConfig(Map<String, Object> config) {
        var context = new DefaultWorkflowContext("w", "t", "task", Map.of("quantity", 4, "unrelatedSecret", "never-forward", WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("custom", config)));
        context.updateCurrentNodeId("custom"); return context;
    }
    @Test void callsExistingHttpServiceAndPublishesOnlyValidatedOutputs() throws Exception {
        var http = new FakeHttp(); var executor = new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper());
        var result = executor.execute(context("API"));
        assertThat(result.variables()).isEqualTo(Map.of("myTotal", 8)); assertThat(http.body).isEqualTo(Map.of("count", 4));
        assertThat(result.output()).containsEntry("templateVersion", "1.0.0"); assertThat(executor.supportsAutomaticRetry()).isFalse();
        http.response = new HttpJsonRequestService.Response(500, null, "", false, "HTTP_STATUS_ERROR");
        assertThatThrownBy(() -> executor.execute(context("API"))).hasMessageContaining("500");
        http.response = new HttpJsonRequestService.Response(200, Map.of("total", "invalid"), "", true, "");
        assertThatThrownBy(() -> executor.execute(context("API"))).hasMessageContaining("NUMBER");
        http.response = new HttpJsonRequestService.Response(200, Map.of("total", 9), "", true, "");
        assertThat(executor.execute(context("API")).variables()).isEqualTo(Map.of("myTotal", 9));
    }
    @Test void codeUsesIsolatedRuntimeWithOnlyDeclaredPayloadAndServerLimits() throws Exception {
        var properties = new WorkflowNodeProperties(); properties.setCodeExecutionEnabled(true); properties.setCodeRuntimeIsolationConfirmed(true);
        properties.setCodeTimeoutMs(500); properties.setCodeMaxOutputBytes(2048);
        var runtime = new FakeRuntime(); var executor = new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), properties, runtime);
        assertThat(executor.execute(context("CODE", Map.of("timeoutMs", 999999, "maxOutputBytes", 999999))).variables()).isEqualTo(Map.of("myTotal", 8));
        assertThat(runtime.input).isEqualTo(Map.of("inputs", Map.of("count", 4), "config", Map.of()));
        assertThat(runtime.timeout).isEqualTo(500); assertThat(runtime.bytes).isEqualTo(2048);
        properties.setCodeRuntimeIsolationConfirmed(false);
        assertThatThrownBy(() -> executor.execute(context("CODE"))).hasMessageContaining("isolated"); assertThat(runtime.calls).isEqualTo(1);
        properties.setCodeExecutionEnabled(false);
        assertThatThrownBy(() -> executor.execute(context("CODE"))).hasMessageContaining("disabled"); assertThat(runtime.calls).isEqualTo(1);
    }
    @Test void cancelledApiDoesNotStartRequestAndNextInvocationRecovers() throws Exception {
        var http = new FakeHttp(); var executor = new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper());
        try { Thread.currentThread().interrupt(); assertThatThrownBy(() -> executor.execute(context("API"))).hasMessageContaining("取消"); assertThat(http.calls).isZero(); }
        finally { Thread.interrupted(); }
        assertThat(executor.execute(context("API")).successful()).isTrue();
    }
    @Test void existingBuiltinApiAndCodeContractsRemainAvailable() throws Exception {
        var http = new FakeHttp(); var executor = new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper());
        assertThat(executor.execute(withConfig(Map.of("url", "https://example.com/api", "method", "POST", "bodyJson", "{\"old\":true}"))).variables()).containsKey("httpResponse");
        assertThat(http.body).isEqualTo(Map.of("old", true));
        var properties = new WorkflowNodeProperties(); properties.setCodeExecutionEnabled(true); properties.setCodeRuntimeIsolationConfirmed(true);
        var runtime = new FakeRuntime(); var code = new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), properties, runtime);
        assertThat(code.execute(withConfig(Map.of("code", "def main(payload): return payload", "input", Map.of("old", true)))).variables()).containsKey("codeResult");
        assertThat(runtime.input).isEqualTo(Map.of("old", true));
    }

    @Test void optionalEnumNullSurvivesSaveValidationAndIsOmittedFromRuntimePayload() throws Exception {
        var definition = definition("CODE");
        definition.put("fields", List.of(Map.of("name", "mode", "type", "STRING", "required", false, "defaultValue", "A", "options", List.of("A", "B"))));
        var values = new LinkedHashMap<String, Object>(); values.put("mode", null);
        var config = Map.<String, Object>of("customDefinition", definition, "inputBindings", Map.of("count", "quantity"), "customValues", values);
        var node = new com.aetherflow.common.dto.WorkflowNodeDTO(); node.setNodeType("CODE"); node.setConfig(config);
        assertThat(com.aetherflow.workflow.node.validation.WorkflowNodeConfigValidator.validate(node, List.of())).isEmpty();
        var properties = new WorkflowNodeProperties(); properties.setCodeExecutionEnabled(true); properties.setCodeRuntimeIsolationConfirmed(true);
        var runtime = new FakeRuntime(); var executor = new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), properties, runtime);
        assertThat(executor.execute(withConfig(config)).variables()).isEqualTo(Map.of("myTotal", 8));
        assertThat(runtime.input).isEqualTo(Map.of("inputs", Map.of("count", 4), "config", Map.of()));
    }
}
