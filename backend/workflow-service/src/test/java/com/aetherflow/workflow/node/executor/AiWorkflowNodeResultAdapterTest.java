package com.aetherflow.workflow.node.executor;

// pattern: Functional Core

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    void routesCommittedMediaAliasesToDownstreamFileUrlAcrossSerializedResponseFormats() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        for (String extension : new String[]{"mp4", "wav", "mp3", "m4a", "aac"}) {
            String transformedUrl = "https://files.test/transformed/converted." + extension;
            AiWorkflowNodeResponseDTO stagedResponse = new AiWorkflowNodeResponseDTO(
                    "FFMPEG", "SUCCEEDED", Map.of(
                    "mediaUrl", transformedUrl,
                    "mediaFileId", 9001L,
                    "artifactFiles", java.util.List.of(Map.of("originalName", "converted." + extension, "url", transformedUrl))));
            AiWorkflowNodeResponseDTO callbackResponse = objectMapper.readValue(
                    objectMapper.writeValueAsString(stagedResponse), AiWorkflowNodeResponseDTO.class);

            NodeResult result = AiWorkflowNodeResultAdapter.adapt(callbackResponse.getNodeType(), callbackResponse.getOutput());

            assertThat(result.variables())
                    .containsEntry("mediaUrl", transformedUrl)
                    .containsEntry("fileUrl", transformedUrl)
                    .containsEntry("mediaFileId", 9001)
                    .containsEntry("fileId", 9001);
        }
    }

    @Test
    void derivesClassifierBranchKeyFromStructuredCompletionText() {
        // 模型只把 JSON 写进 completionText（ai-service 未回填 jsonData）时，
        // 旧实现会把整段 JSON 当成分支键，导致分支匹配失败落到默认边。
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER",
                Map.of("completionText", "{\"route\":\"support\",\"confidence\":0.9}"));

        assertThat(result.branchKey()).isEqualTo("support");
        assertThat(result.variables())
                .containsEntry("route", "support")
                .containsEntry("routeJson", Map.of("route", "support", "confidence", 0.9D));
    }

    @Test
    void derivesClassifierRouteFromFencedStructuredCompletionText() {
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER",
                Map.of("completionText", "```json\n{\"route\":\"billing\"}\n```"));

        assertThat(result.branchKey()).isEqualTo("billing");
        assertThat(result.variables()).containsEntry("route", "billing");
    }

    @Test
    void keepsClassifierBareLabelCompletionTextCompatible() {
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER",
                Map.of("completionText", " billing "));

        assertThat(result.branchKey()).isEqualTo("billing");
        assertThat(result.variables()).containsEntry("route", "billing");
    }

    @Test
    void derivesParameterExtractorParamsFromStructuredCompletionText() {
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "PARAMETER_EXTRACTOR",
                Map.of("completionText", "{\"orderId\":\"A1\"}"));

        assertThat(result.variables())
                .containsEntry("params", Map.of("orderId", "A1"))
                .containsEntry("paramsJson", Map.of("orderId", "A1"));
        assertThat(result.branchKey()).isNull();
    }

    @Test
    void readsStructuredOutputFromAiServiceMetadataFallback() {
        // ai-service 把结构化输出放在 metadata.jsonData 时同样要生效。
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER",
                Map.of("completionText", "unsupported plain text",
                        "metadata", Map.of("jsonData", Map.of("route", "support"))));

        assertThat(result.branchKey()).isEqualTo("support");
        assertThat(result.variables()).containsEntry("route", "support");
    }

    @Test
    void rejectsClassifierOutputWithoutUsableRoute() {
        for (String completionText : new String[]{
                "", " ", "{\"confidence\":0.9}", "{\"route\":", "[\"support\"]", "```json\nnot json\n```"}) {
            assertThatThrownBy(() -> AiWorkflowNodeResultAdapter.adapt(
                    "QUESTION_CLASSIFIER", Map.of("completionText", completionText)))
                    .as("completionText=%s", completionText)
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("route");
        }
        // 完全没有输出时同样不能静默路由。
        assertThatThrownBy(() -> AiWorkflowNodeResultAdapter.adapt("QUESTION_CLASSIFIER", Map.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("route");
    }

    @Test
    void rejectsParameterExtractorOutputWithoutStructuredObject() {
        for (String completionText : new String[]{"", "no parameters found", "{\"orderId\":", "[\"A1\"]"}) {
            assertThatThrownBy(() -> AiWorkflowNodeResultAdapter.adapt(
                    "PARAMETER_EXTRACTOR", Map.of("completionText", completionText)))
                    .as("completionText=%s", completionText)
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("parameter extractor");
        }
        assertThatThrownBy(() -> AiWorkflowNodeResultAdapter.adapt("PARAMETER_EXTRACTOR", Map.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("parameter extractor");
    }

    @Test
    void keepsEmptyStructuredObjectAsValidEmptyParameters() {
        // 模型明确返回空对象表示没有抽取到参数，属于合法结果，不应报错。
        NodeResult result = AiWorkflowNodeResultAdapter.adapt(
                "PARAMETER_EXTRACTOR", Map.of("completionText", "{}"));

        assertThat(result.variables())
                .containsEntry("params", Map.of())
                .containsEntry("paramsJson", Map.of());
    }
}
