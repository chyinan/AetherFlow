package com.aetherflow.file.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.util.LinkedHashSet;
import java.util.Set;

@Data
@ConfigurationProperties(prefix = "aetherflow.file.upload")
public class FileUploadProperties {

    private DataSize maxSize = DataSize.ofMegabytes(500);
    private int rateLimitCount = 20;
    private long rateLimitWindowSeconds = 60;
    private long progressTtlSeconds = 3600;
    private long uploadCacheTtlSeconds = 86400;
    private long hashCacheTtlSeconds = 604800;
    private Set<String> allowedExtensions = new LinkedHashSet<>();
    private Set<String> allowedMimeTypes = new LinkedHashSet<>();
    private Set<String> blockedExtensions = new LinkedHashSet<>();
}
