package com.aetherflow.ai.workflow;

// pattern: Functional Core

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.ai.file.ArtifactRegistrationResult;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public record AiNodeResult(
        String nodeType,
        String status,
        Map<String, Object> output,
        List<AiArtifact> artifacts,
        String artifactBatchId,
        Integer artifactCount
) {

    public AiNodeResult(String nodeType, String status, Map<String, Object> output, List<AiArtifact> artifacts) {
        this(nodeType, status, output, artifacts, null, null);
    }

    public AiNodeResult withStoredArtifactFiles(List<FileMetadataDTO> files) {
        return withStoredArtifactFiles(new ArtifactRegistrationResult(null, files == null ? 0 : files.size(), files));
    }

    public AiNodeResult withStoredArtifactFiles(ArtifactRegistrationResult registration) {
        List<FileMetadataDTO> files = registration == null ? List.of() : registration.files();
        if (files == null || files.isEmpty()) {
            return new AiNodeResult(nodeType, status, output, List.of(), null, null);
        }
        Map<String, Object> enrichedOutput = new LinkedHashMap<>(output == null ? Map.of() : output);
        enrichedOutput.put("artifactFiles", List.copyOf(files));
        List<Long> imageFileIds = new java.util.ArrayList<>();
        List<String> imageObjectKeys = new java.util.ArrayList<>();
        List<String> imageUrls = new java.util.ArrayList<>();
        int mappedCount = Math.min(artifacts == null ? 0 : artifacts.size(), files.size());
        List<Map<String, Object>> artifactTypeBindings = new java.util.ArrayList<>();
        for (int index = 0; index < mappedCount; index++) {
            AiArtifact artifact = artifacts.get(index);
            FileMetadataDTO file = files.get(index);
            if (artifact == null || file == null || artifact.type() == null || artifact.type().isBlank()) {
                continue;
            }
            String prefix = artifact.type().trim().toLowerCase(Locale.ROOT);
            artifactTypeBindings.add(Map.of("index", index, "type", prefix));
            if (file.getId() != null) {
                enrichedOutput.put(prefix + "FileId", file.getId());
                if ("image".equals(prefix)) imageFileIds.add(file.getId());
            }
            if (file.getObjectKey() != null && !file.getObjectKey().isBlank()) {
                enrichedOutput.put(prefix + "ObjectKey", file.getObjectKey());
                if ("image".equals(prefix)) imageObjectKeys.add(file.getObjectKey());
            }
            if (file.getUrl() != null && !file.getUrl().isBlank() && !"image".equals(prefix)) {
                enrichedOutput.put(prefix + "Url", file.getUrl());
            }
            if ("image".equals(prefix) && file.getUrl() != null && !file.getUrl().isBlank()) imageUrls.add(file.getUrl());
        }
        if (!imageFileIds.isEmpty()) enrichedOutput.put("imageFileIds", List.copyOf(imageFileIds));
        if (!imageObjectKeys.isEmpty()) enrichedOutput.put("imageObjectKeys", List.copyOf(imageObjectKeys));
        if (!imageUrls.isEmpty()) enrichedOutput.put("imageUrls", List.copyOf(imageUrls));
        if (!artifactTypeBindings.isEmpty()) {
            // 以类型和序号保留产物到文件的对应关系；原始 AiArtifact 字节会在 Outbox 序列化前移除，
            // 最终提交回执仍需据此重建类型化 URL 别名。
            enrichedOutput.put("artifactTypeBindings", List.copyOf(artifactTypeBindings));
        }
        restoreTypedArtifactAliases(enrichedOutput, files);
        // 暂存 Outbox 不保留签名 URL；延迟发布时按已提交文件元数据重建兼容 URL，
        // 避免客户端继续使用已经过期的 STAGED 链接。
        for (FileMetadataDTO file : files) {
            String prefix = legacyPrefix(file == null ? null : file.getOriginalName());
            if (prefix != null && file.getUrl() != null && !file.getUrl().isBlank()) {
                enrichedOutput.put(prefix + "Url", file.getUrl());
            }
        }
        return new AiNodeResult(nodeType, status, Map.copyOf(enrichedOutput), List.of(),
                registration == null ? null : registration.batchId(),
                registration == null ? files.size() : registration.expectedCount());
    }

    private static void restoreTypedArtifactAliases(Map<String, Object> output, List<FileMetadataDTO> files) {
        Object rawBindings = output.get("artifactTypeBindings");
        if (!(rawBindings instanceof List<?> bindings)) {
            return;
        }
        Set<Long> imageFileIds = numberSet(output.get("imageFileIds"));
        Set<String> imageObjectKeys = stringSet(output.get("imageObjectKeys"));
        Set<String> imageUrls = stringSet(output.get("imageUrls"));
        for (Object rawBinding : bindings) {
            if (!(rawBinding instanceof Map<?, ?> binding)
                    || !(binding.get("index") instanceof Number indexValue)
                    || !(binding.get("type") instanceof String type)) {
                continue;
            }
            int index = indexValue.intValue();
            if (index < 0 || index >= files.size() || type.isBlank()) {
                continue;
            }
            FileMetadataDTO file = files.get(index);
            if (file == null) {
                continue;
            }
            if (file.getId() != null) output.put(type + "FileId", file.getId());
            if (file.getObjectKey() != null && !file.getObjectKey().isBlank()) {
                output.put(type + "ObjectKey", file.getObjectKey());
            }
            if ("image".equals(type)) {
                if (file.getId() != null) imageFileIds.add(file.getId());
                if (file.getObjectKey() != null && !file.getObjectKey().isBlank()) imageObjectKeys.add(file.getObjectKey());
                if (file.getUrl() != null && !file.getUrl().isBlank()) imageUrls.add(file.getUrl());
            } else if (file.getUrl() != null && !file.getUrl().isBlank()) {
                output.put(type + "Url", file.getUrl());
            }
        }
        if (!imageFileIds.isEmpty()) output.put("imageFileIds", List.copyOf(imageFileIds));
        if (!imageObjectKeys.isEmpty()) output.put("imageObjectKeys", List.copyOf(imageObjectKeys));
        if (!imageUrls.isEmpty()) output.put("imageUrls", List.copyOf(imageUrls));
    }

    private static Set<Long> numberSet(Object value) {
        Set<Long> values = new LinkedHashSet<>();
        if (value instanceof List<?> list) {
            list.stream().filter(Number.class::isInstance).map(Number.class::cast)
                    .map(Number::longValue).forEach(values::add);
        }
        return values;
    }

    private static Set<String> stringSet(Object value) {
        Set<String> values = new LinkedHashSet<>();
        if (value instanceof List<?> list) {
            list.stream().filter(String.class::isInstance).map(String.class::cast).forEach(values::add);
        }
        return values;
    }

    private static String legacyPrefix(String originalName) {
        if (originalName == null || originalName.isBlank()) {
            return null;
        }
        String name = originalName.toLowerCase(Locale.ROOT);
        if (name.endsWith(".srt")) return "srt";
        if (name.endsWith(".vtt")) return "vtt";
        if (name.endsWith(".wav") || name.endsWith(".mp3") || name.endsWith(".m4a")
                || name.endsWith(".aac") || name.endsWith(".mp4")) return "media";
        return null;
    }
}
