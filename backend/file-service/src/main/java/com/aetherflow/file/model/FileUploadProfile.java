package com.aetherflow.file.model;

public record FileUploadProfile(
        String originalName,
        String extension,
        String contentType,
        long size
) {
}
