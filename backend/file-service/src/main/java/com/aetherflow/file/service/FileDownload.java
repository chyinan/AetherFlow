package com.aetherflow.file.service;

import java.io.InputStream;

public record FileDownload(
        String originalName,
        String contentType,
        Long size,
        InputStream stream
) {
}
