package com.aetherflow.ai.workflow.executor;

// pattern: Imperative Shell

import com.aetherflow.ai.service.PythonAsrClient;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class AsrNodeExecutor implements AiNodeExecutor {

    private final PythonAsrClient pythonAsrClient;

    public AsrNodeExecutor(PythonAsrClient pythonAsrClient) {
        this.pythonAsrClient = pythonAsrClient;
    }

    @Override
    public String nodeType() {
        return "ASR";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        AiTranscriptionRequestDTO request = new AiTranscriptionRequestDTO();
        request.setFileUrl(context.payloadString("fileUrl"));
        request.setLanguage(context.payloadString("language", "auto"));
        request.setPrompt(context.payloadString("prompt", ""));
        AiTranscriptionResponseDTO response = pythonAsrClient.transcribe(request);
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("text", response.getText());
        output.put("durationSeconds", response.getDurationSeconds());
        List<AiArtifact> artifacts = new ArrayList<>();
        if (response.getSrtContent() != null && !response.getSrtContent().isBlank()) {
            String fileName = response.getSrtFileName() == null || response.getSrtFileName().isBlank()
                    ? "transcription.srt"
                    : response.getSrtFileName().trim();
            artifacts.add(new AiArtifact(
                    "SRT", fileName, "text/plain", response.getSrtContent().getBytes(StandardCharsets.UTF_8)));
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, artifacts);
    }
}
