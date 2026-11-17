package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchRequest;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchResponse;
import com.aetherflow.workflow.ingestion.url.UrlIngestionService;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UrlFetchNodeExecutorTest {

    @Test
    void directNonblankUrlTakesPrecedenceOverVariable() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();
        UrlFetchNodeExecutor executor = executor(service);

        NodeResult result = executor.execute(context(
                Map.of("url", " https://example.com/fixed ", "urlVariable", "articleUrl"),
                Map.of("articleUrl", "https://example.com/input")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/fixed");
        assertThat(result.variables()).containsEntry("urlText", "Example page text");
    }

    @Test
    void omittedVariableBindingPrefersLegacyUrlVariable() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();

        executor(service).execute(context(Map.of(), Map.of(
                "url", "https://example.com/legacy-url",
                "websiteUrl", "https://example.com/website")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/legacy-url");
    }

    @Test
    void blankVariableBindingRetainsLegacyResolution() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();

        executor(service).execute(context(Map.of("urlVariable", " "), Map.of(
                "url", "https://example.com/legacy-url",
                "websiteUrl", "https://example.com/website")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/legacy-url");
    }

    @Test
    void omittedVariableBindingFallsBackToWebsiteUrl() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();

        executor(service).execute(context(Map.of(), Map.of("websiteUrl", "https://example.com/website")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/website");
    }

    @Test
    void explicitWebsiteUrlBindingUsesOnlyThatVariable() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();

        executor(service).execute(context(Map.of("urlVariable", "websiteUrl"), Map.of(
                "url", "https://example.com/legacy-url",
                "websiteUrl", "https://example.com/website")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/website");
    }

    @Test
    void explicitCustomBindingUsesItsValue() throws Exception {
        StubUrlIngestionService service = new StubUrlIngestionService();

        executor(service).execute(context(Map.of("urlVariable", "articleUrl"),
                Map.of("articleUrl", "https://example.com/article")));

        assertThat(service.requestedUrl).isEqualTo("https://example.com/article");
    }

    @Test
    void missingExplicitCustomBindingDoesNotReadWebsiteUrl() {
        StubUrlIngestionService service = new StubUrlIngestionService();

        assertThatThrownBy(() -> executor(service).execute(context(Map.of("urlVariable", "articleUrl"),
                Map.of("websiteUrl", "https://example.com/other"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("url fetch node url is required");

        assertThat(service.calls).isZero();
    }

    @Test
    void explicitUrlBindingIsStrictButStillWorksWhenPresent() throws Exception {
        StubUrlIngestionService presentService = new StubUrlIngestionService();
        executor(presentService).execute(context(Map.of("urlVariable", "url"), Map.of(
                "url", "https://example.com/legacy-url",
                "websiteUrl", "https://example.com/other")));
        assertThat(presentService.requestedUrl).isEqualTo("https://example.com/legacy-url");

        StubUrlIngestionService missingService = new StubUrlIngestionService();
        assertThatThrownBy(() -> executor(missingService).execute(context(Map.of("urlVariable", "url"),
                Map.of("websiteUrl", "https://example.com/other"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("url fetch node url is required");
        assertThat(missingService.calls).isZero();
    }

    private static UrlFetchNodeExecutor executor(UrlIngestionService service) {
        return new UrlFetchNodeExecutor(new WorkflowNodeMetrics(), service);
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("url-fetch", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("url-fetch");
        return context;
    }

    private static final class StubUrlIngestionService implements UrlIngestionService {
        private int calls;
        private String requestedUrl;

        @Override
        public UrlFetchResponse fetch(UrlFetchRequest request) {
            calls++;
            requestedUrl = request.getUrl();
            return new UrlFetchResponse(requestedUrl, "Example", "Example page text", 18, "text/html", 200);
        }
    }
}
