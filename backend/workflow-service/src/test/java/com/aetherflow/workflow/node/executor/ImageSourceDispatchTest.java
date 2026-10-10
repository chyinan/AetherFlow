package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ImageSourceDispatchTest {

    @Test
    void textToImageDispatchDoesNotValidateOrFetchUnusedSourceVariable() {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        ImageSourceResolver resolver = new ImageSourceResolver(fileClient, new WorkflowNodeProperties());
        ImageGenerationNodeExecutor executor = new ImageGenerationNodeExecutor(
                new WorkflowNodeMetrics(), aiClient, storage, resolver);
        AsyncAiTaskDispatcher dispatcher = mock(AsyncAiTaskDispatcher.class);
        when(dispatcher.isEnabled()).thenReturn(true);
        when(dispatcher.dispatch(any(), anyString(), any())).thenReturn(123L);
        ReflectionTestUtils.setField(executor, "asyncAiTaskDispatcher", dispatcher);
        DefaultWorkflowContext context = context(Map.of("mode", "txt2img", "sourceImageVariable", "imageFileIds"),
                Map.of("imageFileIds", List.of(), "userId", 99L));

        assertThatThrownBy(() -> executor.execute(context)).isInstanceOf(NodeWaitingException.class);

        verify(dispatcher).dispatch(eq(context), eq("IMAGE_GENERATION"), argThat(payload ->
                List.of().equals(payload.get("sourceImage"))));
        verifyNoInteractions(fileClient, aiClient, storage);
    }

    @ParameterizedTest
    @CsvSource({
            "IMAGE_GENERATION,false,imageFileIds", "IMAGE_GENERATION,true,upscaledImageFileIds",
            "UPSCALE,false,savedImageFileIds", "UPSCALE,true,imageFileIds"
    })
    void resolvesUpstreamFilesBeforeBothDispatchPaths(String nodeType, boolean async, String variableName) throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        FileMetadataDTO file = new FileMetadataDTO(7L, "images", "source.png", "source.png", "image/png", 5L, null);
        when(fileClient.getMetadata(anyString(), eq(99L), eq(7L))).thenReturn(Result.success(file));
        when(fileClient.downloadFile(anyString(), eq(99L), eq(7L))).thenReturn(ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG).body("image".getBytes(StandardCharsets.UTF_8)));
        ImageSourceResolver resolver = new ImageSourceResolver(fileClient, new WorkflowNodeProperties());
        BaseNodeExecutor executor = "UPSCALE".equals(nodeType)
                ? new UpscaleNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage, resolver)
                : new ImageGenerationNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage, resolver);
        Map<String, Object> config = Map.of("mode", "img2img", "sourceImage", "", "sourceImageVariable", variableName);
        DefaultWorkflowContext context = context(config, Map.of(variableName, List.of(7L, 8L), "userId", 99L));
        if (async) {
            AsyncAiTaskDispatcher dispatcher = mock(AsyncAiTaskDispatcher.class);
            when(dispatcher.isEnabled()).thenReturn(true);
            when(dispatcher.dispatch(eq(context), eq(nodeType), any())).thenReturn(123L);
            ReflectionTestUtils.setField(executor, "asyncAiTaskDispatcher", dispatcher);

            assertThatThrownBy(() -> executor.execute(context)).isInstanceOf(NodeWaitingException.class);

            verify(dispatcher).dispatch(eq(context), eq(nodeType), argThat(payload ->
                    "aW1hZ2U=".equals(payload.get("sourceImage"))
                            && "image/png".equals(payload.get("sourceImageContentType"))));
            verifyNoInteractions(aiClient, storage);
        } else {
            when(aiClient.execute(any())).thenReturn(Result.success(new AiWorkflowNodeResponseDTO(nodeType, "SUCCEEDED",
                    Map.of("images", List.of(Map.of("fileName", "output.png", "contentType", "image/png",
                            "base64Data", "aW1hZ2U="))))));
            when(storage.store(anyString(), anyString(), eq(99L), any())).thenReturn(file);

            executor.execute(context);

            verify(aiClient).execute(argThat(request -> "aW1hZ2U=".equals(request.getPayload().get("sourceImage"))
                    && "image/png".equals(request.getPayload().get("sourceImageContentType"))));
        }
        verify(fileClient).getMetadata(anyString(), eq(99L), eq(7L));
        verify(fileClient).downloadFile(anyString(), eq(99L), eq(7L));
    }

    @ParameterizedTest
    @CsvSource({"true", "false"})
    void inlineBase64TakesPrecedenceOverSelectedVariable(boolean dataUrl) throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        ImageSourceResolver resolver = new ImageSourceResolver(fileClient, new WorkflowNodeProperties());
        UpscaleNodeExecutor executor = new UpscaleNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage, resolver);
        AsyncAiTaskDispatcher dispatcher = mock(AsyncAiTaskDispatcher.class);
        when(dispatcher.isEnabled()).thenReturn(true);
        when(dispatcher.dispatch(any(), anyString(), any())).thenReturn(123L);
        ReflectionTestUtils.setField(executor, "asyncAiTaskDispatcher", dispatcher);
        DefaultWorkflowContext context = context(Map.of("sourceImage", (dataUrl ? "data:image/jpeg;base64," : "") + "aW1hZ2U=",
                "sourceImageVariable", "imageFileIds"), Map.of("imageFileIds", List.of(7L), "userId", 99L));

        assertThatThrownBy(() -> executor.execute(context)).isInstanceOf(NodeWaitingException.class);

        verify(dispatcher).dispatch(eq(context), eq("UPSCALE"), argThat(payload ->
                "aW1hZ2U=".equals(payload.get("sourceImage"))
                        && (dataUrl ? "image/jpeg" : "image/png").equals(payload.get("sourceImageContentType"))));
        verifyNoInteractions(fileClient, aiClient, storage);
    }

    @ParameterizedTest
    @CsvSource({
            "IMAGE_GENERATION,false,false", "IMAGE_GENERATION,false,true",
            "IMAGE_GENERATION,true,false", "IMAGE_GENERATION,true,true",
            "UPSCALE,false,false", "UPSCALE,false,true",
            "UPSCALE,true,false", "UPSCALE,true,true"
    })
    void inputValidationTokenReachesRealExecutorsBeforeDispatch(String nodeType, boolean async, boolean emptyIds) {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        ImageSourceResolver resolver = new ImageSourceResolver(fileClient, new WorkflowNodeProperties());
        BaseNodeExecutor executor = "UPSCALE".equals(nodeType)
                ? new UpscaleNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage, resolver)
                : new ImageGenerationNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage, resolver);
        AsyncAiTaskDispatcher dispatcher = mock(AsyncAiTaskDispatcher.class);
        if (async) {
            ReflectionTestUtils.setField(executor, "asyncAiTaskDispatcher", dispatcher);
        }
        Map<String, Object> variables = emptyIds
                ? Map.of("imageFileIds", List.of(), "userId", 99L)
                : Map.of("userId", 99L);
        DefaultWorkflowContext context = context(
                Map.of("mode", "img2img", "sourceImageVariable", "imageFileIds"), variables);

        // 验证真实节点入口透传结构化输入诊断，且失败发生在同步调用/异步派发之前。
        assertThatThrownBy(() -> executor.execute(context))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:VALIDATION]")
                .hasMessageContaining(emptyIds ? "有效的文件 ID" : "请选择源图片")
                .hasNoCause();
        verifyNoInteractions(aiClient, fileClient, storage, dispatcher);
    }

    private DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("image-node", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("image-node");
        return context;
    }
}
