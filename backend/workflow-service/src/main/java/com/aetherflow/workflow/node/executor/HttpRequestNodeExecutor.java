package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.http.HttpJsonRequestService;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
public class HttpRequestNodeExecutor extends BaseNodeExecutor {
    private final HttpJsonRequestService requests;
    private final ObjectMapper json;

    public HttpRequestNodeExecutor(WorkflowNodeMetrics metrics, HttpJsonRequestService requests, ObjectMapper json) {
        super(WorkflowNodeTypes.HTTP_REQUEST, metrics);
        this.requests = requests;
        this.json = json;
    }

    @Override
    public boolean supportsAutomaticRetry() {
        // 超时或失败响应不能证明远端未执行；写入请求不可由工作流重试策略自动重放。
        return false;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) throws Exception {
        if (config.containsKey("customDefinition")) return executeCustom(context, config);
        String strategy = text(config.get("errorStrategy"), "FAIL").toUpperCase(Locale.ROOT);
        if (!strategy.equals("FAIL") && !strategy.equals("BRANCH")) throw invalid("HTTP 错误策略无效");
        if (strategy.equals("BRANCH")) {
            Map<String, Object> branches = asMap(config.get("branches"));
            if (text(branches.get("success"), "").isBlank() || text(branches.get("error"), "").isBlank()) {
                throw invalid("HTTP 分支策略必须连接 success 和 error 两个分支");
            }
        }
        String url = text(config.get("url"), "");
        if (url.isBlank()) url = text(context.variables().get(text(config.get("urlVariable"), "requestUrl")), "");
        if (url.isBlank()) throw invalid("HTTP 请求 URL 不能为空");
        String bodyVariable = text(config.get("bodyVariable"), "");
        String bodyJson = text(config.get("bodyJson"), "");
        if (!bodyVariable.isBlank() && !bodyJson.isBlank()) throw invalid("JSON 请求体和请求体变量只能选择一个");
        Object body = null;
        boolean hasBody = !bodyVariable.isBlank() || !bodyJson.isBlank();
        if (!bodyVariable.isBlank()) {
            if (!context.variables().containsKey(bodyVariable)) throw invalid("HTTP 请求体变量不存在");
            body = context.variables().get(bodyVariable);
        } else if (!bodyJson.isBlank()) {
            try {
                body = json.readerFor(Object.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(bodyJson);
            } catch (Exception exception) {
                throw invalid("HTTP 请求体必须是有效 JSON");
            }
        }
        HttpJsonRequestService.Response response = requests.request(url, text(config.get("method"), "GET"), body, hasBody);
        if (!response.ok() && strategy.equals("FAIL")) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "HTTP 请求失败：" + response.error() + "，状态码 " + response.statusCode());
        }
        // 将可为 null 的 JSON 响应放入对象内部，保持运行时顶层变量的非空契约。
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("statusCode", response.statusCode());
        envelope.put("body", response.body());
        envelope.put("bodyText", response.bodyText());
        envelope.put("ok", response.ok());
        envelope.put("error", response.error());
        Map<String, Object> output = Map.of("httpResponse", envelope, "httpStatusCode", response.statusCode(),
                "httpBodyText", response.bodyText(), "httpOk", response.ok(), "httpError", response.error());
        Map<String, Object> variables = new LinkedHashMap<>(output);
        variables.put(text(config.get("outputVariable"), "httpResponse"), envelope);
        NodeResult result = buildResult(output, variables);
        return strategy.equals("BRANCH") ? result.withBranchKey(response.ok() ? "success" : "error") : result;
    }

    private static String text(Object value, String fallback) {
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value).trim();
    }

    private NodeResult executeCustom(WorkflowContext context, Map<String, Object> config) {
        try {
            var prepared = com.aetherflow.workflow.node.custom.CustomNodeDefinition.prepare("HTTP_REQUEST", config, context.variables());
            var definition = prepared.definition();
            var request = definition.request();
            Map<String, String> headers = new LinkedHashMap<>();
            asMap(request.get("headers")).forEach((key, value) -> {
                Object resolved = definition.resolve(value, prepared, false);
                if (resolved instanceof Map<?, ?> || resolved instanceof java.util.List<?>) throw invalid("请求头占位符必须是标量");
                headers.put(key, String.valueOf(resolved));
            });
            if (Thread.currentThread().isInterrupted()) throw invalid("自定义 API 请求已取消");
            var response = requests.request(String.valueOf(definition.resolve(request.get("url"), prepared, true)),
                    String.valueOf(request.get("method")), definition.resolve(request.get("body"), prepared, false), request.containsKey("body"), headers);
            if (Thread.currentThread().isInterrupted()) throw invalid("自定义 API 请求已取消");
            if (!response.ok()) throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "自定义 API " + definition.id + "@" + definition.version + " 请求失败：" + response.error() + "，状态码 " + response.statusCode());
            Map<String, Object> outputs = definition.mapOutputs(response.body());
            return buildResult(Map.of("templateId", definition.id, "templateVersion", definition.version,
                    "statusCode", response.statusCode(), "result", outputs), outputs);
        } catch (IllegalArgumentException exception) { throw invalid(exception.getMessage()); }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ResultCode.BAD_REQUEST, message);
    }
}
