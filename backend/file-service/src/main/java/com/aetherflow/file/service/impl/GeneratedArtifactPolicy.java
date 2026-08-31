package com.aetherflow.file.service.impl;

// pattern: Functional Core

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.exception.BusinessException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;

final class GeneratedArtifactPolicy {

    private static final Set<String> ALLOWED_KINDS = Set.of(
            "subtitle", "transcript", "summary", "document", "image", "archive");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "text/plain", "text/markdown", "text/csv", "application/json",
            "image/png", "image/jpeg", "image/webp", "application/zip",
            "audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "video/mp4");

    private GeneratedArtifactPolicy() {
    }

    static PreparedGeneratedArtifact prepare(CreateGeneratedFileRequestDTO request, long maxDecodedBytes) {
        if (request == null) {
            throw badRequest("generated artifact request is required");
        }
        if (request.getUserId() == null || request.getUserId() <= 0) {
            throw badRequest("generated artifact userId must be positive");
        }
        if (request.getAiJobId() == null || request.getAiJobId() <= 0
                || request.getTaskId() == null || request.getTaskId() <= 0) {
            throw badRequest("generated artifact task ownership is required");
        }
        required(request.getLeaseToken(), "leaseToken", 64);
        required(request.getArtifactBatchId(), "artifactBatchId", 128);
        if (request.getArtifactOrdinal() == null || request.getArtifactOrdinal() < 0) {
            throw badRequest("generated artifact ordinal must be non-negative");
        }
        String idempotencyKey = required(request.getIdempotencyKey(), "idempotencyKey", 128);
        String workflowId = required(request.getWorkflowId(), "workflowId", 128);
        if (!workflowId.matches("[A-Za-z0-9._-]+")) {
            throw badRequest("generated artifact workflowId contains unsupported characters");
        }
        String source = required(request.getSource(), "source", 32).toLowerCase(Locale.ROOT);
        if (!"artifact".equals(source)) {
            throw badRequest("generated artifact source must be artifact");
        }
        String artifactKind = required(request.getArtifactKind(), "artifactKind", 64).toLowerCase(Locale.ROOT);
        if (!ALLOWED_KINDS.contains(artifactKind)) {
            throw badRequest("generated artifact kind is unsupported");
        }
        String contentType = required(request.getContentType(), "contentType", 128).toLowerCase(Locale.ROOT);
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw badRequest("generated artifact content type is unsupported");
        }
        String originalName = sanitizeFileName(required(request.getOriginalName(), "originalName", 255));
        byte[] content = decodeContent(request.getContentBase64(), maxDecodedBytes);
        String contentHash = sha256(content);
        String operationHash = sha256(idempotencyKey.getBytes(StandardCharsets.UTF_8)).substring(0, 24);
        String objectKey = "workflow/exports/%s/users/%s/generated/%s-%s".formatted(
                workflowId, request.getUserId(), operationHash, originalName);
        return new PreparedGeneratedArtifact(
                request.getUserId(), idempotencyKey, workflowId, source, artifactKind,
                originalName, contentType, content, contentHash, objectKey);
    }

    private static byte[] decodeContent(String contentBase64, long maxDecodedBytes) {
        if (maxDecodedBytes <= 0) {
            throw new IllegalArgumentException("maxDecodedBytes must be positive");
        }
        String encoded = required(contentBase64, "contentBase64", Integer.MAX_VALUE);
        long maxEncodedLength = ((maxDecodedBytes + 2L) / 3L) * 4L + 4L;
        if (encoded.length() > maxEncodedLength) {
            throw badRequest("generated artifact exceeds configured size limit");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException exception) {
            throw badRequest("generated artifact contentBase64 is invalid");
        }
        if (decoded.length == 0 || decoded.length > maxDecodedBytes) {
            throw badRequest("generated artifact exceeds configured size limit");
        }
        return decoded;
    }

    private static String sanitizeFileName(String value) {
        String sanitized = value.replace('\\', '_').replace('/', '_')
                .replaceAll("[^A-Za-z0-9._-]", "_");
        sanitized = sanitized.replaceAll("^[.]+", "");
        if (sanitized.isBlank() || sanitized.length() > 255) {
            throw badRequest("generated artifact originalName is invalid");
        }
        return sanitized;
    }

    private static String required(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) {
            throw badRequest("generated artifact " + field + " is required");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw badRequest("generated artifact " + field + " is too long");
        }
        return normalized;
    }

    private static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static BusinessException badRequest(String message) {
        return new BusinessException(ResultCode.BAD_REQUEST, message);
    }

    record PreparedGeneratedArtifact(
            Long userId,
            String idempotencyKey,
            String workflowId,
            String source,
            String artifactKind,
            String originalName,
            String contentType,
            byte[] content,
            String sha256,
            String objectKey
    ) {
        PreparedGeneratedArtifact {
            content = content.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }
}
