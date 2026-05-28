package com.aetherflow.file.support;

import org.springframework.util.StringUtils;

public final class FileRedisKeys {

    private static final String FILE_UPLOAD_PREFIX = "file:upload:";
    private static final String FILE_HASH_PREFIX = "file:hash:";
    private static final String FILE_PROGRESS_PREFIX = "file:progress:";

    private FileRedisKeys() {
    }

    public static String upload(Long fileId) {
        return FILE_UPLOAD_PREFIX + requirePositiveId(fileId, "fileId");
    }

    public static String uploadRate(Long userId) {
        return FILE_UPLOAD_PREFIX + "rate:" + requirePositiveId(userId, "userId");
    }

    public static String hash(String sha256) {
        if (!StringUtils.hasText(sha256)) {
            throw new IllegalArgumentException("sha256 must not be blank");
        }
        return FILE_HASH_PREFIX + sha256;
    }

    public static String progress(String taskId) {
        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("taskId must not be blank");
        }
        return FILE_PROGRESS_PREFIX + taskId;
    }

    public static String progressPattern() {
        return FILE_PROGRESS_PREFIX + "*";
    }

    private static long requirePositiveId(Long value, String name) {
        if (value == null || value <= 0) {
            throw new IllegalArgumentException(name + " must be positive");
        }
        return value;
    }
}
