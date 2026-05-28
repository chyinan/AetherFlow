package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadNodeExecutorTest {

    @Test
    void readsFileMetadataAndWritesFileVariables() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setFileInternalToken("token");
        UploadNodeExecutor executor = new UploadNodeExecutor(new WorkflowNodeMetrics(), fileClient, properties);
        FileMetadataDTO metadata = new FileMetadataDTO(
                9L,
                "aetherflow",
                "objects/audio.mp3",
                "audio.mp3",
                "audio/mpeg",
                1024L,
                "http://minio/aetherflow/objects/audio.mp3"
        );
        when(fileClient.getMetadata("token", 9L)).thenReturn(Result.success(metadata));

        NodeResult result = executor.execute(context(Map.of("fileId", 9L), Map.of()));

        assertThat(result.output()).containsEntry("fileId", 9L);
        assertThat(result.variables()).containsEntry("fileUrl", metadata.getUrl());
        assertThat(result.variables()).containsEntry("fileBucket", metadata.getBucket());
        assertThat(result.variables()).containsEntry("fileObjectKey", metadata.getObjectKey());
        assertThat(result.variables()).containsEntry("fileOriginalName", metadata.getOriginalName());
        assertThat(result.variables()).containsEntry("fileContentType", metadata.getContentType());
        assertThat(result.variables()).containsEntry("fileSize", metadata.getSize());
        verify(fileClient).getMetadata("token", 9L);
    }

    @Test
    void readsFileIdFromConfiguredVariableName() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setFileInternalToken("token");
        UploadNodeExecutor executor = new UploadNodeExecutor(new WorkflowNodeMetrics(), fileClient, properties);
        FileMetadataDTO metadata = new FileMetadataDTO(
                9L,
                "aetherflow",
                "objects/audio.mp3",
                "audio.mp3",
                "audio/mpeg",
                1024L,
                "http://minio/aetherflow/objects/audio.mp3"
        );
        when(fileClient.getMetadata("token", 9L)).thenReturn(Result.success(metadata));

        NodeResult result = executor.execute(context(Map.of("fileIdVariable", "sourceFileId"),
                Map.of("sourceFileId", 9L)));

        assertThat(result.variables()).containsEntry("fileUrl", metadata.getUrl());
        verify(fileClient).getMetadata("token", 9L);
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("upload", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("upload");
        return context;
    }
}
