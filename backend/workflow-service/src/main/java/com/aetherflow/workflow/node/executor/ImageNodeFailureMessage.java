package com.aetherflow.workflow.node.executor;

import feign.FeignException;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// pattern: Functional Core
final class ImageNodeFailureMessage {
    private static final Pattern TOKEN = Pattern.compile(
            "\\[IMAGE_EXECUTION:(COMFYUI|SD_WEBUI|AI_SERVICE):(INPUT|UPLOAD|QUEUE|POLL|GENERATION|DOWNLOAD|REQUEST|OUTPUT):"
                    + "(sourceImage|workflow|checkpoint|sampler|scheduler|vae|lora|upscaler|timeoutSeconds|connectionId|seed|mode):"
                    + "(VALIDATION|HTTP|UNREACHABLE|TIMEOUT|INTERRUPTED|REJECTED|FAILED|EMPTY|INVALID_RESPONSE)\\]");

    private ImageNodeFailureMessage() { }

    static boolean appliesTo(String nodeType) {
        return "IMAGE_GENERATION".equals(nodeType) || "UPSCALE".equals(nodeType);
    }

    static String fromException(RuntimeException exception, Map<String, Object> payload, String nodeType) {
        String known = knownMessage(exception instanceof FeignException feign
                ? feign.contentUTF8() : exception.getMessage());
        if (known != null) return known;
        String message = exception.getMessage();
        String reason = message != null && message.startsWith("ai node call timed out") ? "TIMEOUT"
                : message != null && message.startsWith("ai node call interrupted") ? "INTERRUPTED" : "FAILED";
        return fallback(payload, nodeType, reason);
    }

    static String fromResult(String message, Map<String, Object> payload, String nodeType) {
        String known = knownMessage(message);
        return known == null ? fallback(payload, nodeType, "FAILED") : known;
    }

    static String knownMessage(String message) {
        if (message == null) return null;
        Matcher matcher = TOKEN.matcher(message);
        if (!matcher.find()) return null;
        // 跨服务只保留封闭枚举，不传播 Feign URL、响应正文或异常附带的敏感内容。
        return matcher.group() + safeAdvice(matcher.group(3), matcher.group(4));
    }

    private static String fallback(Map<String, Object> payload, String nodeType, String reason) {
        String field = "TIMEOUT".equals(reason) ? "timeoutSeconds" : "connectionId";
        return "[IMAGE_EXECUTION:AI_SERVICE:REQUEST:" + field + ":" + reason + "]"
                + safeAdvice(field, reason);
    }

    private static String safeAdvice(String field, String reason) {
        if ("TIMEOUT".equals(reason) || "INTERRUPTED".equals(reason)) {
            return "图像调用等待结束；远端任务可能仍在执行，请先查看服务队列，再决定是否重新运行。";
        }
        return "图像执行失败，请检查节点配置字段 " + field + "，测试连接后再手动重新运行。";
    }
}
