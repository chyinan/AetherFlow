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
import io.minio.RemoveObjectArgs;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.UUID;

// pattern: Imperative Shell
@Component
public class ImageArtifactStorage {

    private static final int MAX_IMAGE_BYTES = 20 * 1024 * 1024;

    private final MinioClient minioClient;
    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties properties;
    private final WorkflowNodeConfig.MinioProperties minioProperties;

    public ImageArtifactStorage(MinioClient minioClient,
                                FileMetadataClient fileClient,
                                WorkflowNodeProperties properties,
                                WorkflowNodeConfig.MinioProperties minioProperties) {
        this.minioClient = minioClient;
        this.fileClient = fileClient;
        this.properties = properties;
        this.minioProperties = minioProperties;
    }

    public FileMetadataDTO store(String workflowId,
                                 String nodeId,
                                 Long userId,
                                 ImageWorkflowDtos.GeneratedImage image) {
        if (image == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image is required");
        }
        byte[] bytes = decode(image.getBase64Data());
        String fileName = sanitize(image.getFileName() == null ? "image.png" : image.getFileName());
        String contentType = contentType(image);
        String objectKey = objectKey(workflowId, nodeId, fileName);
        upload(objectKey, contentType, bytes);
        try {
            return createMetadata(userId, objectKey, fileName, contentType, bytes.length);
        } catch (RuntimeException exception) {
            removeUploadedObject(objectKey);
            throw exception;
        }
    }

    private byte[] decode(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image data is empty");
        }
        String encoded = base64.trim();
        if (encoded.regionMatches(true, 0, "data:", 0, 5)) {
            int comma = encoded.indexOf(',');
            if (comma < 0) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "generated image data URI is invalid");
            }
            encoded = encoded.substring(comma + 1);
        }
        if (encoded.length() > ((MAX_IMAGE_BYTES + 2) / 3) * 4) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image exceeds the 20 MB limit");
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(encoded);
            if (decoded.length > MAX_IMAGE_BYTES) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "generated image exceeds the 20 MB limit");
            }
            return decoded;
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image data is invalid base64");
        }
    }

    private void upload(String objectKey, String contentType, byte[] bytes) {
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectKey)
                    .stream(inputStream, bytes.length, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow image upload failed");
        }
    }

    private void removeUploadedObject(String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectKey)
                    .build());
        } catch (Exception exception) {
            // Preserve the metadata failure while recording that reconciliation must clean the object later.
        }
    }

    private FileMetadataDTO createMetadata(Long userId, String objectKey, String fileName, String contentType, long size) {
        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket(minioProperties.getBucket());
        request.setObjectKey(objectKey);
        request.setOriginalName(fileName);
        request.setContentType(contentType);
        request.setSize(size);
        if (userId != null && userId > 0) {
            request.setUserId(userId);
        }
        Result<FileMetadataDTO> result = fileClient.createMetadata(properties.issueFileInternalToken(), request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow image metadata registration failed");
        }
        return result.getData();
    }

    private String objectKey(String workflowId, String nodeId, String fileName) {
        String prefix = trimSlashes(properties.getExportObjectPrefix()) + "/images/"
                + sanitizeSegment(workflowId) + "/" + sanitizeSegment(nodeId);
        String timestamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(OffsetDateTime.now());
        return prefix + "/" + timestamp + "-" + UUID.randomUUID() + "-" + fileName;
    }

    private String contentType(ImageWorkflowDtos.GeneratedImage image) {
        String contentType = image.getContentType() == null || image.getContentType().isBlank()
                ? "image/png"
                : image.getContentType().trim().toLowerCase(java.util.Locale.ROOT);
        if (!java.util.Set.of("image/png", "image/jpeg", "image/webp", "image/gif").contains(contentType)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image content type is invalid");
        }
        return contentType;
    }

    private String sanitize(String value) {
        String sanitized = value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return sanitized.isBlank() ? "image.png" : sanitized;
    }

    private String sanitizeSegment(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return sanitize(value);
    }

    private String trimSlashes(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("^/+", "").replaceAll("/+$", "");
    }
}
