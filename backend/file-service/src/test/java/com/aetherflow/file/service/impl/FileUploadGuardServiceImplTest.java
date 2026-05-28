package com.aetherflow.file.service.impl;

import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.exception.FileTypeException;
import com.aetherflow.file.model.FileUploadProfile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

import java.util.LinkedHashSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileUploadGuardServiceImplTest {

    private FileUploadGuardServiceImpl service;

    @BeforeEach
    void setUp() {
        FileUploadProperties properties = new FileUploadProperties();
        properties.setMaxSize(DataSize.ofMegabytes(1));
        properties.setAllowedExtensions(new LinkedHashSet<>(java.util.List.of("txt", "json")));
        properties.setAllowedMimeTypes(new LinkedHashSet<>(java.util.List.of("text/plain", "application/json")));
        properties.setBlockedExtensions(new LinkedHashSet<>(java.util.List.of("exe", "bat")));
        service = new FileUploadGuardServiceImpl(properties);
    }

    @Test
    void validateShouldAcceptSafeFile() {
        MockMultipartFile file = new MockMultipartFile("file", "demo.txt", "text/plain", "hello".getBytes());

        FileUploadProfile profile = service.validate(file);

        assertThat(profile.originalName()).isEqualTo("demo.txt");
        assertThat(profile.extension()).isEqualTo("txt");
        assertThat(profile.contentType()).isEqualTo("text/plain");
        assertThat(profile.size()).isEqualTo(5);
    }

    @Test
    void validateShouldRejectBlockedExtension() {
        MockMultipartFile file = new MockMultipartFile("file", "bad.exe", "application/octet-stream", "MZ".getBytes());

        assertThatThrownBy(() -> service.validate(file))
                .isInstanceOf(FileTypeException.class)
                .hasMessageContaining("blocked");
    }
}
