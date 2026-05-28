package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.FileInternalProperties;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class InternalFileControllerTest {

    @Test
    void rejectsMetadataCreationWhenInternalTokenDoesNotMatch() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken("expected-token");
        InternalFileController controller = new InternalFileController(fileInfoService, properties);

        assertThatThrownBy(() -> controller.createMetadata("wrong-token", validRequest()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(fileInfoService);
    }

    @Test
    void createsMetadataWhenInternalTokenMatches() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken("expected-token");
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        CreateFileMetadataRequestDTO request = validRequest();
        FileMetadataDTO metadata = new FileMetadataDTO(
                1L,
                "aetherflow",
                "outputs/demo.txt",
                "demo.txt",
                "text/plain",
                16L,
                "http://minio/aetherflow/outputs/demo.txt"
        );
        when(fileInfoService.createMetadata(null, request)).thenReturn(metadata);

        Result<FileMetadataDTO> result = controller.createMetadata("expected-token", request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(metadata);
        verify(fileInfoService).createMetadata(null, request);
    }

    @Test
    void returnsMetadataWhenInternalTokenMatches() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken("expected-token");
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        FileMetadataDTO metadata = new FileMetadataDTO(
                7L,
                "aetherflow",
                "objects/audio.mp3",
                "audio.mp3",
                "audio/mpeg",
                1024L,
                "http://minio/aetherflow/objects/audio.mp3"
        );
        when(fileInfoService.getMetadata(7L)).thenReturn(metadata);

        Result<FileMetadataDTO> result = controller.getMetadata("expected-token", 7L);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(metadata);
        verify(fileInfoService).getMetadata(7L);
    }

    private CreateFileMetadataRequestDTO validRequest() {
        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket("aetherflow");
        request.setObjectKey("outputs/demo.txt");
        request.setOriginalName("demo.txt");
        request.setContentType("text/plain");
        request.setSize(16L);
        return request;
    }
}
