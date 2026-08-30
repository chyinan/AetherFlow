package com.aetherflow.workflow.document;

// pattern: Functional Core
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class DocumentFormatPolicy {

    public static final List<String> DOCUMENT_EXTENSIONS = List.of(
            "csv", "doc", "docx", "eml", "epub", "htm", "html", "json", "markdown", "md", "mdx",
            "msg", "odp", "ods", "odt", "pdf", "ppt", "pptx", "properties", "rtf", "text", "tsv",
            "txt", "vtt", "xls", "xlsx", "xhtml", "xml", "yaml", "yml"
    );
    public static final List<String> IMAGE_OCR_EXTENSIONS = List.of(
            "bmp", "jpeg", "jpg", "png", "tif", "tiff"
    );
    public static final List<String> OCR_EXTENSIONS = combinedExtensions();

    private static final Set<String> DOCUMENT_EXTENSION_SET = Set.copyOf(DOCUMENT_EXTENSIONS);
    private static final Set<String> IMAGE_EXTENSION_SET = Set.copyOf(IMAGE_OCR_EXTENSIONS);
    private static final Map<String, String> EXTENSION_BY_CONTENT_TYPE = Map.ofEntries(
            Map.entry("application/pdf", "pdf"),
            Map.entry("application/epub+zip", "epub"),
            Map.entry("application/msword", "doc"),
            Map.entry("application/vnd.ms-excel", "xls"),
            Map.entry("application/vnd.ms-outlook", "msg"),
            Map.entry("application/vnd.ms-powerpoint", "ppt"),
            Map.entry("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            Map.entry("message/rfc822", "eml"),
            Map.entry("image/bmp", "bmp"),
            Map.entry("image/jpeg", "jpeg"),
            Map.entry("image/png", "png"),
            Map.entry("image/tiff", "tiff")
    );

    private DocumentFormatPolicy() {
    }

    public static boolean supportsDocument(String fileName, String contentType) {
        String extension = extension(fileName);
        if (!extension.isBlank()) {
            return DOCUMENT_EXTENSION_SET.contains(extension);
        }
        String normalizedContentType = normalizedContentType(contentType);
        return normalizedContentType.startsWith("text/")
                || DOCUMENT_EXTENSION_SET.contains(EXTENSION_BY_CONTENT_TYPE.getOrDefault(normalizedContentType, ""));
    }

    public static boolean supportsImageOcr(String fileName, String contentType) {
        String extension = extension(fileName);
        if (!extension.isBlank()) {
            return IMAGE_EXTENSION_SET.contains(extension);
        }
        return IMAGE_EXTENSION_SET.contains(EXTENSION_BY_CONTENT_TYPE.getOrDefault(
                normalizedContentType(contentType), ""));
    }

    public static String extension(String fileName) {
        if (fileName == null) {
            return "";
        }
        String normalized = fileName.trim();
        int index = normalized.lastIndexOf('.');
        if (index < 0 || index == normalized.length() - 1) {
            return "";
        }
        return normalized.substring(index + 1).toLowerCase(Locale.ROOT);
    }

    private static String normalizedContentType(String contentType) {
        if (contentType == null) {
            return "";
        }
        int separator = contentType.indexOf(';');
        String value = separator >= 0 ? contentType.substring(0, separator) : contentType;
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static List<String> combinedExtensions() {
        LinkedHashSet<String> extensions = new LinkedHashSet<>();
        extensions.addAll(DOCUMENT_EXTENSIONS);
        extensions.addAll(IMAGE_OCR_EXTENSIONS);
        ArrayList<String> sorted = new ArrayList<>(extensions);
        sorted.sort(String::compareTo);
        return List.copyOf(sorted);
    }
}
