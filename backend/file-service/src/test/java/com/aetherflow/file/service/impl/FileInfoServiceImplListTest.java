package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.entity.FileInfo;
import com.aetherflow.file.mapper.FileInfoMapper;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.service.FileGovernanceCacheService;
import com.aetherflow.file.service.FileHashService;
import com.aetherflow.file.service.FileUploadGuardService;
import com.aetherflow.file.service.MinioHealthService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileInfoServiceImplListTest {

    private FileInfoMapper fileInfoMapper;
    private FileInfoServiceImpl service;

    @BeforeEach
    void setUp() {
        fileInfoMapper = mock(FileInfoMapper.class);
        service = new FileInfoServiceImpl(
                mock(MinioClient.class),
                new MinioProperties(),
                fileInfoMapper,
                mock(FileUploadGuardService.class),
                mock(FileHashService.class),
                mock(FileGovernanceCacheService.class),
                mock(MinioHealthService.class)
        );
    }

    @Test
    void listsAvailableUserFilesAsFileAssets() {
        when(fileInfoMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(fileInfoMapper.selectList(any(Wrapper.class))).thenReturn(List.of(audioFile()));

        FileAssetPageResponse response = service.listAssets(
                1001L,
                "demo",
                "audio",
                "input",
                "input",
                null,
                1,
                20
        );

        assertThat(response.page()).isEqualTo(1);
        assertThat(response.pageSize()).isEqualTo(20);
        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).id()).isEqualTo(101L);
        assertThat(response.items().get(0).type()).isEqualTo("audio");
        assertThat(response.items().get(0).source()).isEqualTo("input");
        assertThat(response.items().get(0).artifactKind()).isEqualTo("input");
        assertThat(response.items().get(0).status()).isEqualTo("ready");
        assertThat(response.items().get(0).downloadUrl()).isEqualTo("http://minio/aetherflow/demo.mp3");
    }

    @Test
    void returnsEmptyPageForUnpersistedWorkflowFilter() {
        FileAssetPageResponse response = service.listAssets(1001L, null, null, null, null, "wf-1", 1, 20);

        assertThat(response.total()).isZero();
        assertThat(response.items()).isEmpty();
        verify(fileInfoMapper, never()).selectCount(any(Wrapper.class));
    }

    @Test
    void returnsEmptyPageForUnsupportedSourceOrArtifactKind() {
        FileAssetPageResponse sourceResponse = service.listAssets(1001L, null, null, "external", null, null, 1, 20);
        FileAssetPageResponse artifactResponse = service.listAssets(1001L, null, null, null, "unknown-kind", null, 1, 20);

        assertThat(sourceResponse.items()).isEmpty();
        assertThat(artifactResponse.items()).isEmpty();
        verify(fileInfoMapper, never()).selectCount(any(Wrapper.class));
    }

    @Test
    void listsWorkflowExportsAsArtifacts() {
        when(fileInfoMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(fileInfoMapper.selectList(any(Wrapper.class))).thenReturn(List.of(exportFile()));

        FileAssetPageResponse response = service.listAssets(
                1001L,
                null,
                null,
                "artifact",
                "summary",
                null,
                1,
                20
        );

        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).type()).isEqualTo("artifact");
        assertThat(response.items().get(0).source()).isEqualTo("artifact");
        assertThat(response.items().get(0).artifactKind()).isEqualTo("summary");
    }

    @Test
    void rejectsMissingUserContext() {
        assertThatThrownBy(() -> service.listAssets(null, null, null, null, null, null, 1, 20))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception -> assertThat(((BusinessException) exception).getErrorCode())
                        .isEqualTo(ResultCode.UNAUTHORIZED));
    }

    private static FileInfo audioFile() {
        FileInfo fileInfo = new FileInfo();
        fileInfo.setId(101L);
        fileInfo.setUserId(1001L);
        fileInfo.setBucket("aetherflow");
        fileInfo.setObjectKey("objects/demo.mp3");
        fileInfo.setOriginalName("demo.mp3");
        fileInfo.setContentType("audio/mpeg");
        fileInfo.setMimeType("audio/mpeg");
        fileInfo.setFileSize(2048L);
        fileInfo.setFileUrl("http://minio/aetherflow/demo.mp3");
        fileInfo.setStatus("AVAILABLE");
        fileInfo.setCreatedAt(LocalDateTime.parse("2026-05-29T09:00:00"));
        fileInfo.setUpdatedAt(LocalDateTime.parse("2026-05-29T09:30:00"));
        return fileInfo;
    }

    private static FileInfo exportFile() {
        FileInfo fileInfo = audioFile();
        fileInfo.setId(102L);
        fileInfo.setObjectKey("workflow/exports/5/node-export/meeting-summary.md");
        fileInfo.setOriginalName("meeting-summary.md");
        fileInfo.setContentType("text/markdown");
        fileInfo.setMimeType("text/markdown");
        fileInfo.setFileUrl("http://minio/aetherflow/workflow/exports/5/node-export/meeting-summary.md");
        return fileInfo;
    }
}
