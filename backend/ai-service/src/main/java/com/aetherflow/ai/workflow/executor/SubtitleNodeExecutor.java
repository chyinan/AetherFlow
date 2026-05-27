package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
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
            output.put("objectKey", response.objectKey());
            if (response.objectKey() != null && !response.objectKey().isBlank()) {
                artifacts.add(new AiArtifact(response.format().toUpperCase(), response.objectKey(), "text/plain"));
            }
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, artifacts);
    }

    private record SubtitleRequest(String text, String format, Double lineSeconds) {
    }

    private record SubtitleResponse(String content, String format, String objectKey) {
    }
}
