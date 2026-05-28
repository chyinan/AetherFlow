package com.aetherflow.file.support;

import org.slf4j.MDC;
import org.springframework.util.StringUtils;

public final class FileLogContext {

    public static final String TRACE_ID = "traceId";
    public static final String FILE_ID = "fileId";
    public static final String USER_ID = "userId";

    private FileLogContext() {
    }

    public static String traceId() {
        return value(TRACE_ID);
    }

    public static String fileId() {
        return value(FILE_ID);
    }

    public static String userId() {
        return value(USER_ID);
    }

    public static void putTraceId(String traceId) {
        put(TRACE_ID, traceId);
    }

    public static void putFileId(Long fileId) {
        if (fileId != null) {
            put(FILE_ID, String.valueOf(fileId));
        }
    }

    public static void putFileId(String fileId) {
        put(FILE_ID, fileId);
    }

    public static void putUserId(Long userId) {
        if (userId != null) {
            put(USER_ID, String.valueOf(userId));
        }
    }

    public static void clear() {
        MDC.remove(TRACE_ID);
        MDC.remove(FILE_ID);
        MDC.remove(USER_ID);
    }

    private static void put(String key, String value) {
        if (StringUtils.hasText(value)) {
            MDC.put(key, value);
        }
    }

    private static String value(String key) {
        String value = MDC.get(key);
        return StringUtils.hasText(value) ? value : "-";
    }
}
