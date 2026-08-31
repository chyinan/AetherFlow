package com.aetherflow.ai.workflow.executor;

// pattern: Imperative Shell

import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SubtitleNodeExecutor implements AiNodeExecutor {

    private final RestClient pythonAiRestClient;

    public SubtitleNodeExecutor(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient) {
        this.pythonAiRestClient = pythonAiRestClient;
    }

    @Override
    public String nodeType() {
        return "SUBTITLE";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        SubtitleRequest request = new SubtitleRequest(
                context.payloadString("text"),
                context.payloadString("format", "srt"),
                Double.parseDouble(context.payloadString("lineSeconds", "3"))
        );
        SubtitleResponse response = pythonAiRestClient.post()
                .uri("/v1/subtitles")
                .body(request)
                .retrieve()
                .body(SubtitleResponse.class);
        Map<String, Object> output = new LinkedHashMap<>();
        List<AiArtifact> artifacts = new ArrayList<>();
        if (response != null) {
            output.put("content", response.content());
            output.put("format", response.format());
            if (response.content() != null && !response.content().isBlank()) {
                String format = response.format() == null || response.format().isBlank()
                        ? "srt"
                        : response.format().toLowerCase();
                artifacts.add(new AiArtifact(
                        format.toUpperCase(), "subtitle." + format, "text/plain",
                        response.content().getBytes(StandardCharsets.UTF_8)));
            }
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, artifacts);
    }

    private record SubtitleRequest(String text, String format, Double lineSeconds) {
    }

    private record SubtitleResponse(String content, String format) {
    }
}
