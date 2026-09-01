package com.aetherflow.workflow.node.executor;

// pattern: Functional Core

import com.aetherflow.workflow.runtime.api.NodeResult;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// pattern: Functional Core
class AiWorkflowNodeResultAdapterTest {

    @Test
    void adaptsQuestionClassifierRouteVariablesAndBranchKey() {
        Map<String, Object> routeJson = Map.of("route", "billing", "confidence", 0.91D);

        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER",
                Map.of("completionText", "billing", "jsonData", routeJson));

        assertThat(result.variables())
                .containsEntry("route", "billing")
                .containsEntry("routeJson", routeJson)
                .containsEntry("completion", "billing");
        assertThat(result.branchKey()).isEqualTo("billing");
    }

    @Test
    void adaptsAgentPlanAndActionLog() {
        Map<String, Object> plan = Map.of("steps", java.util.List.of("search", "answer"));

        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "AGENT",
                Map.of("completionText", "planned", "jsonData", plan));

        assertThat(result.variables())
                .containsEntry("plan", plan)
                .containsEntry("actionLog", "planned");
    }

    @Test
    void adaptsQuestionIntentAndExtractedParameters() {
        Map<String, Object> intent = Map.of("intent", "refund", "language", "zh-CN");
        NodeResult understood = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_UNDERSTAND", Map.of("jsonData", intent));
        Map<String, Object> params = Map.of("orderId", "A-100");
        NodeResult extracted = AiWorkflowNodeResultAdapter.adapt(
                "PARAMETER_EXTRACTOR", Map.of("jsonData", params));

        assertThat(understood.variables())
                .containsEntry("intent", intent)
                .containsEntry("intentJson", intent);
        assertThat(extracted.variables())
                .containsEntry("params", params)
                .containsEntry("paramsJson", params);
    }

    @Test
    void adaptsWhisperTranslateAndSummaryOutputs() {
        NodeResult whisper = AiWorkflowNodeResultAdapter.adapt(
                "WHISPER", Map.of("text", "hello", "durationSeconds", 3.2D,
                        "srtFileId", 19L, "srtObjectKey", "workflow/19.srt", "srtUrl", "https://files/19.srt"));
        NodeResult translate = AiWorkflowNodeResultAdapter.adapt(
                "TRANSLATE", Map.of("translatedText", "你好"));
        NodeResult summary = AiWorkflowNodeResultAdapter.adapt(
                "SUMMARY", Map.of("summary", "要点"));

        assertThat(whisper.variables()).containsEntry("transcription", "hello")
                .containsEntry("srtFileId", 19L)
                .containsEntry("srtObjectKey", "workflow/19.srt")
                .containsEntry("srtUrl", "https://files/19.srt");
        assertThat(translate.variables())
                .containsEntry("translation", "你好")
                .containsEntry("translatedText", "你好");
        assertThat(summary.variables()).containsEntry("summary", "要点");
    }

    @Test
    void adaptsFfmpegArtifactToGenericFileVariablesForDownstreamNodes() {
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "FFMPEG",
                Map.of(
                        "mediaFileId", 9001L,
                        "mediaUrl", "https://minio.test/transformed.wav",
                        "mediaObjectKey", "tenant-7/transformed.wav"));

        assertThat(result.variables())
                .containsEntry("mediaFileId", 9001L)
                .containsEntry("mediaUrl", "https://minio.test/transformed.wav")
                .containsEntry("mediaObjectKey", "tenant-7/transformed.wav")
                .containsEntry("fileId", 9001L)
                .containsEntry("fileUrl", "https://minio.test/transformed.wav")
                .containsEntry("fileObjectKey", "tenant-7/transformed.wav");
    }
}
