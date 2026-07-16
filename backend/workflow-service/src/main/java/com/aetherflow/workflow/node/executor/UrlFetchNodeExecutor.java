package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchRequest;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchResponse;
import com.aetherflow.workflow.ingestion.url.UrlIngestionService;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class UrlFetchNodeExecutor extends BaseNodeExecutor {

    private final UrlIngestionService urlIngestionService;

    public UrlFetchNodeExecutor(WorkflowNodeMetrics metrics, UrlIngestionService urlIngestionService) {
        super(WorkflowNodeTypes.URL_FETCH, metrics);
        this.urlIngestionService = urlIngestionService;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        UrlFetchRequest request = new UrlFetchRequest();
        request.setUrl(url(config, context));
        request.setMaxChars(number(config.get("maxChars")));
        UrlFetchResponse response = urlIngestionService.fetch(request);
        Map<String, Object> output = output(response);
        Map<String, Object> variables = new LinkedHashMap<>(output);
        String outputVariable = text(config.get("outputVariable"), "urlText");
        variables.put(outputVariable, response.text());
        return buildResult(output, variables);
    }

    private String url(Map<String, Object> config, WorkflowContext context) {
        String direct = text(config.get("url"), "");
        if (!direct.isBlank()) {
            return direct;
        }
        String variableName = text(config.get("urlVariable"), "url");
        Object value = context.variables().get(variableName);
        if (value == null) {
            value = context.variables().get("websiteUrl");
        }
        String resolved = value == null ? "" : String.valueOf(value).trim();
        if (resolved.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url fetch node url is required");
        }
        return resolved;
    }

    private Map<String, Object> output(UrlFetchResponse response) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("urlSourceUrl", response.url());
        output.put("urlTitle", response.title());
        output.put("urlText", response.text());
        output.put("urlCharCount", response.chars());
        output.put("urlContentType", response.contentType());
        output.put("urlStatusCode", response.statusCode());
        return output;
    }

    private Integer number(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value), 10);
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url fetch node maxChars is invalid");
        }
    }

    private String text(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value).trim();
        return text.isBlank() ? fallback : text;
    }
}
