package com.aetherflow.file.service.impl;

import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.exception.FileTypeException;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.model.FileUploadProfile;
import com.aetherflow.file.service.FileUploadGuardService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FileUploadGuardServiceImpl implements FileUploadGuardService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final int HEADER_LENGTH = 8;

    private final FileUploadProperties uploadProperties;

    @Override
    public FileUploadProfile validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new UploadException("upload file must not be empty");
        }
        long size = file.getSize();
        if (size > uploadProperties.getMaxSize().toBytes()) {
            throw new UploadException("upload file exceeds file-service size limit");
        }

        String originalName = cleanOriginalName(file.getOriginalFilename());
        String extension = resolveExtension(originalName);
        validateExtension(extension);

        String contentType = normalizeContentType(file.getContentType());
        validateContentType(contentType);
        validateHeader(file);

        return new FileUploadProfile(originalName, extension, contentType, size);
    }

    private String cleanOriginalName(String originalName) {
        String cleaned = StringUtils.cleanPath(StringUtils.hasText(originalName) ? originalName : "file");
        if (cleaned.contains("..")) {
            throw new FileTypeException("upload file name is illegal");
        }
        cleaned = cleaned.replace("\\", "_").replace("/", "_").trim();
        if (!StringUtils.hasText(cleaned)) {
            throw new FileTypeException("upload file name must not be blank");
        }
        return cleaned;
    }

    private String resolveExtension(String originalName) {
        String extension = StringUtils.getFilenameExtension(originalName);
        if (!StringUtils.hasText(extension)) {
            throw new FileTypeException("upload file extension is required");
        }
        return extension.toLowerCase(Locale.ROOT);
    }

    private void validateExtension(String extension) {
        Set<String> blocked = normalizeSet(uploadProperties.getBlockedExtensions());
        if (blocked.contains(extension)) {
            throw new FileTypeException("upload file extension is blocked");
        }
        Set<String> allowed = normalizeSet(uploadProperties.getAllowedExtensions());
        if (!allowed.isEmpty() && !allowed.contains(extension)) {
            throw new FileTypeException("upload file extension is not allowed");
        }
    }

    private String normalizeContentType(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return DEFAULT_CONTENT_TYPE;
        }
        int separator = contentType.indexOf(';');
        String normalized = separator >= 0 ? contentType.substring(0, separator) : contentType;
        return normalized.trim().toLowerCase(Locale.ROOT);
    }

    private void validateContentType(String contentType) {
        Set<String> allowed = normalizeSet(uploadProperties.getAllowedMimeTypes());
        if (!allowed.isEmpty() && !allowed.contains(contentType)) {
            throw new FileTypeException("upload file MIME type is not allowed");
        }
    }

    private void validateHeader(MultipartFile file) {
        byte[] header;
        try (InputStream inputStream = file.getInputStream()) {
            header = inputStream.readNBytes(HEADER_LENGTH);
        } catch (IOException exception) {
            throw new UploadException("upload file cannot be inspected");
        }

        // Block known executable / script signatures to prevent uploading
        // malicious binaries disguised as allowed file types.
        if (startsWith(header, 'M', 'Z')                           // Windows PE / DLL
                || startsWith(header, 0x7F, 'E', 'L', 'F')          // Linux ELF
                || startsWith(header, '#', '!')                     // Shell script shebang
                || startsWith(header, 0xCA, 0xFE, 0xBA, 0xBE)       // Java class
                || startsWith(header, 0xFE, 0xED, 0xFA, 0xCE)       // Mach-O 32
                || startsWith(header, 0xFE, 0xED, 0xFA, 0xCF)       // Mach-O 64
                || startsWith(header, 0xCF, 0xFA, 0xED, 0xFE)       // Mach-O 64 (reverse)
                || startsWith(header, 0xCE, 0xFA, 0xED, 0xFE)       // Mach-O 32 (reverse)
                ) {
            throw new FileTypeException("upload file signature is blocked");
        }
    }

    private boolean startsWith(byte[] header, int... bytes) {
        if (header.length < bytes.length) {
            return false;
        }
        for (int i = 0; i < bytes.length; i++) {
            if ((header[i] & 0xFF) != bytes[i]) {
                return false;
            }
        }
        return true;
    }

    private Set<String> normalizeSet(Set<String> values) {
        return values.stream()
                .filter(StringUtils::hasText)
                .map(value -> value.toLowerCase(Locale.ROOT).trim())
                .collect(Collectors.toSet());
    }
}
