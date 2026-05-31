package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.config.WorkflowNodeConfig;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExportNodeExecutorTest {

    @Test
    void exportsMarkdownToMinioAndRegistersFileMetadata() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setFileInternalToken("token");
        properties.setExportObjectPrefix("workflow/exports");
        WorkflowNodeConfig.MinioProperties minioProperties = new WorkflowNodeConfig.MinioProperties();
        minioProperties.setBucket("aetherflow");
        minioProperties.setPublicEndpoint("http://minio");
        ExportNodeExecutor executor = new ExportNodeExecutor(
                new WorkflowNodeMetrics(),
                minioClient,
                fileClient,
                properties,
                minioProperties
        );
        FileMetadataDTO metadata = new FileMetadataDTO(
                18L,
                "aetherflow",
                "workflow/exports/workflow-1/export/export.md",
                "summary.md",
                "text/markdown",
                4L,
                "http://minio/aetherflow/workflow/exports/workflow-1/export/export.md"
        );
        when(fileClient.createMetadata(eq("token"), any(CreateFileMetadataRequestDTO.class)))
                .thenReturn(Result.success(metadata));

        NodeResult result = executor.execute(context(
                Map.of("format", "MARKDOWN", "fileName", "summary.md"),
                Map.of("summary", "Done")
        ));

        assertThat(result.output()).containsEntry("format", "MARKDOWN");
        assertThat(result.variables()).containsEntry("exportFileId", 18L);
        assertThat(result.variables()).containsEntry("exportFileUrl", metadata.getUrl());
        assertThat(result.variables()).containsKey("exportFile");
        verify(minioClient).putObject(any(PutObjectArgs.class));
        ArgumentCaptor<CreateFileMetadataRequestDTO> metadataCaptor =
                ArgumentCaptor.forClass(CreateFileMetadataRequestDTO.class);
        verify(fileClient).createMetadata(eq("token"), metadataCaptor.capture());
        assertThat(metadataCaptor.getValue().getBucket()).isEqualTo("aetherflow");
        assertThat(metadataCaptor.getValue().getObjectKey())
                .startsWith("workflow/exports/workflow-1/export/");
        assertThat(metadataCaptor.getValue().getOriginalName()).isEqualTo("summary.md");
        assertThat(metadataCaptor.getValue().getContentType()).isEqualTo("text/markdown");
        assertThat(metadataCaptor.getValue().getUserId()).isEqualTo(1001L);
    }

    @Test
    void honorsConfiguredOutputDirectory() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setFileInternalToken("token");
        properties.setExportObjectPrefix("workflow/exports");
        WorkflowNodeConfig.MinioProperties minioProperties = new WorkflowNodeConfig.MinioProperties();
        minioProperties.setBucket("aetherflow");
        ExportNodeExecutor executor = new ExportNodeExecutor(
                new WorkflowNodeMetrics(),
                minioClient,
                fileClient,
                properties,
                minioProperties
        );
        when(fileClient.createMetadata(eq("token"), any(CreateFileMetadataRequestDTO.class)))
                .thenReturn(Result.success(new FileMetadataDTO(
                        19L,
                        "aetherflow",
                        "workflow/exports/meeting-summary/export.md",
                        "summary.md",
                        "text/markdown",
                        4L,
                        "http://minio/aetherflow/workflow/exports/meeting-summary/export.md"
                )));

        executor.execute(context(
                Map.of("format", "MARKDOWN", "fileName", "summary.md", "outputDirectory", "/workflow/exports/meeting-summary/"),
                Map.of("summary", "Done")
        ));

        ArgumentCaptor<CreateFileMetadataRequestDTO> metadataCaptor =
                ArgumentCaptor.forClass(CreateFileMetadataRequestDTO.class);
        verify(fileClient).createMetadata(eq("token"), metadataCaptor.capture());
        assertThat(metadataCaptor.getValue().getObjectKey())
                .startsWith("workflow/exports/meeting-summary/");
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.putIfAbsent("userId", 1001L);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("export", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("export");
        return context;
    }
}
