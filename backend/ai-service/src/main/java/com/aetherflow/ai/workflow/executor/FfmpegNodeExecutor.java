package com.aetherflow.ai.workflow.executor;

// pattern: Imperative Shell

import com.aetherflow.ai.service.PythonMediaClient;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.AiMediaTransformRequestDTO;
import com.aetherflow.common.dto.AiMediaTransformResponseDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class FfmpegNodeExecutor implements AiNodeExecutor {

    private final PythonMediaClient mediaClient;

    @Override
    public String nodeType() {
        return "FFMPEG";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        String fileUrl = context.payloadString("fileUrl");
        if (fileUrl == null || fileUrl.isBlank()) {
            throw new IllegalArgumentException("FFmpeg node requires fileUrl");
        }
        AiMediaTransformRequestDTO request = new AiMediaTransformRequestDTO();
        request.setFileUrl(fileUrl);
        request.setOperation(context.payloadString("operation", "extract-audio"));
        request.setOutputFormat(context.payloadString("outputFormat", "wav"));
        AiMediaTransformResponseDTO response = mediaClient.transform(request);
        byte[] content = Base64.getDecoder().decode(response.getContentBase64());
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("mediaFileName", response.getFileName());
        output.put("mediaContentType", response.getContentType());
        output.put("mediaSize", content.length);
        if (response.getDurationSeconds() != null) {
            output.put("durationSeconds", response.getDurationSeconds());
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of(
                new AiArtifact("MEDIA", response.getFileName(), response.getContentType(), content)));
    }
}
