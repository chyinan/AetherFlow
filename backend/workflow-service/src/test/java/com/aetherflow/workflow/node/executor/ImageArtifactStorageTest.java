package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.config.WorkflowNodeConfig;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImageArtifactStorageTest {

    @Test
    void storesImageAndRegistersMetadata() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties properties = properties();
        WorkflowNodeConfig.MinioProperties minioProperties = minioProperties();
        ImageArtifactStorage storage = new ImageArtifactStorage(minioClient, fileClient, properties, minioProperties);
        when(fileClient.createMetadata(eq("token"), any(CreateFileMetadataRequestDTO.class)))
                .thenReturn(Result.success(new FileMetadataDTO(
                        7L,
                        "aetherflow",
                        "workflow/exports/images/wf/node/image.png",
                        "image.png",
                        "image/png",
                        5L,
                        "http://minio/image.png"
                )));

        FileMetadataDTO metadata = storage.store("wf", "node", 100L,
                new ImageWorkflowDtos.GeneratedImage("im age.png", "image/png", "aW1hZ2U=", null, Map.of()));

        assertThat(metadata.getId()).isEqualTo(7L);
        verify(minioClient).putObject(any(PutObjectArgs.class));
        ArgumentCaptor<CreateFileMetadataRequestDTO> captor =
                ArgumentCaptor.forClass(CreateFileMetadataRequestDTO.class);
        verify(fileClient).createMetadata(eq("token"), captor.capture());
        assertThat(captor.getValue().getBucket()).isEqualTo("aetherflow");
        assertThat(captor.getValue().getObjectKey())
                .startsWith("workflow/exports/images/wf/node/")
                .endsWith("-im_age.png");
        assertThat(captor.getValue().getOriginalName()).isEqualTo("im_age.png");
        assertThat(captor.getValue().getContentType()).isEqualTo("image/png");
        assertThat(captor.getValue().getSize()).isEqualTo(5L);
        assertThat(captor.getValue().getUserId()).isEqualTo(100L);
    }

    @Test
    void rejectsBlankBase64Data() {
        ImageArtifactStorage storage = new ImageArtifactStorage(
                mock(MinioClient.class),
                mock(FileMetadataClient.class),
                properties(),
                minioProperties()
        );

        assertThatThrownBy(() -> storage.store("wf", "node", 100L,
                new ImageWorkflowDtos.GeneratedImage("image.png", "image/png", "", null, Map.of())))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("generated image data is empty");
    }

    private WorkflowNodeProperties properties() {
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setFileInternalToken("token");
        properties.setExportObjectPrefix("workflow/exports");
        return properties;
    }

    private WorkflowNodeConfig.MinioProperties minioProperties() {
        WorkflowNodeConfig.MinioProperties minioProperties = new WorkflowNodeConfig.MinioProperties();
        minioProperties.setBucket("aetherflow");
        return minioProperties;
    }
}
