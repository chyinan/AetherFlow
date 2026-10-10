package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

// pattern: Imperative Shell
@Component
public class ImageSourceResolver {

    // 文件 ID 路径沿用现有图像产物的 20 MiB 上限；本地选择器的 5 MiB 限制不追溯旧工作流。
    static final int MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    private static final Set<String> CONTENT_TYPES = Set.of("image/png", "image/jpeg", "image/webp");

    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties nodeProperties;

    public ImageSourceResolver(FileMetadataClient fileClient, WorkflowNodeProperties nodeProperties) {
        this.fileClient = fileClient;
        this.nodeProperties = nodeProperties;
    }

    Map<String, Object> resolve(Map<String, Object> payload, WorkflowContext context, boolean required) {
        // 文生图及自定义工作流不使用这里的源图，不因遗留变量触发校验或文件读取。
        if (!required) {
            return payload;
        }
        Object source = payload.get("sourceImage");
        if (source == null) {
            throw invalid("请选择源图片或有效的上游图片变量");
        }
        // 上游图像节点输出文件 ID 数组；单图输入只消费第一项，不遍历或读取其他文件。
        if (source instanceof List<?> files) {
            if (files.isEmpty() || !(files.get(0) instanceof Number)) {
                throw invalid("上游图片变量必须包含有效的文件 ID");
            }
            source = files.get(0);
        }
        ResolvedImage image;
        if (source instanceof Number number) {
            image = fromFile(context, fileId(number));
        } else if (source instanceof String text) {
            image = fromBase64(text, payload.get("sourceImageContentType"));
        } else {
            throw invalid("源图片必须是 Base64、文件 ID 或文件 ID 数组");
        }
        Map<String, Object> resolved = new LinkedHashMap<>(payload);
        resolved.put("sourceImage", image.base64());
        resolved.put("sourceImageContentType", image.contentType());
        return resolved;
    }

    private ResolvedImage fromFile(WorkflowContext context, long fileId) {
        Long userId = ImageWorkflowNodeSupport.userId(context);
        if (userId == null || userId <= 0) {
            throw invalid("读取源图片需要有效的用户 ID");
        }
        // 仅调用已有的受权文件服务接口，沿用其文件归属检查，不读取 URL 或本地路径。
        String token = nodeProperties.issueFileInternalToken();
        Result<FileMetadataDTO> metadataResult;
        try {
            metadataResult = fileClient.getMetadata(token, userId, fileId);
        } catch (RuntimeException exception) {
            // 远程异常可能含内部 URL、响应正文或凭据，不将这些内容暴露给运行结果。
            throw unavailable("无法读取源图片元数据");
        }
        if (metadataResult == null || !metadataResult.isSuccess() || metadataResult.getData() == null) {
            throw unavailable("无法读取源图片元数据");
        }
        FileMetadataDTO metadata = metadataResult.getData();
        if (metadata.getSize() == null) {
            throw invalid("源图片缺少文件大小信息");
        }
        validateSize(metadata.getSize());
        String contentType = contentType(metadata.getContentType());
        ResponseEntity<byte[]> response;
        try {
            response = fileClient.downloadFile(token, userId, fileId);
        } catch (RuntimeException exception) {
            throw unavailable("无法下载源图片");
        }
        if (response == null || !response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw unavailable("无法下载源图片");
        }
        MediaType downloadedType = response.getHeaders().getContentType();
        if (downloadedType == null || !contentType.equals(contentType(downloadedType.toString()))) {
            throw invalid("源图片下载类型与元数据不一致");
        }
        byte[] bytes = response.getBody();
        validateSize(bytes.length);
        return new ResolvedImage(Base64.getEncoder().encodeToString(bytes), contentType);
    }

    private ResolvedImage fromBase64(String source, Object declaredType) {
        // 保留旧字符串转发语义，不新增大小或编码格式门禁，也不完整解码旧输入。
        String encoded = source;
        String mime = declaredType == null || String.valueOf(declaredType).isBlank()
                ? null : String.valueOf(declaredType);
        String prefix = source.substring(0, Math.min(source.length(), 128));
        int comma = prefix.indexOf(',');
        if (prefix.regionMatches(true, 0, "data:", 0, 5) && comma > 5) {
            String header = prefix.substring(5, comma).toLowerCase(Locale.ROOT);
            if (header.endsWith(";base64")) {
                String dataType = header.substring(0, header.length() - 7);
                if (CONTENT_TYPES.contains(dataType)) {
                    encoded = source.substring(comma + 1);
                    mime = mime == null ? dataType : mime;
                }
            }
        }
        if (mime == null) {
            mime = "image/png";
            try {
                // 最多解码 16 个 Base64 字符，足以识别 JPEG/WebP 文件头。
                byte[] header = Base64.getDecoder().decode(encoded.substring(0, Math.min(encoded.length(), 16)));
                mime = inferredContentType(header);
            } catch (IllegalArgumentException ignored) {
                // 旧工作流未声明类型或包含非标准 Base64 时，继续由已有 Provider 处理。
            }
        }
        return new ResolvedImage(encoded, mime);
    }

    private String inferredContentType(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        if (bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }
        return "image/png";
    }

    private long fileId(Number number) {
        try {
            long id = new BigDecimal(number.toString()).longValueExact();
            if (id > 0) {
                return id;
            }
        } catch (ArithmeticException | NumberFormatException ignored) {
            // 不把小数或超出范围的值截断为另一个文件 ID。
        }
        throw invalid("源图片文件 ID 必须为正整数");
    }

    private String contentType(String value) {
        if (value == null) {
            throw invalid("源图片缺少 MIME 类型");
        }
        String mime = value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!CONTENT_TYPES.contains(mime)) {
            throw invalid("源图片仅支持 PNG、JPEG 和 WebP");
        }
        return mime;
    }

    private void validateSize(long size) {
        if (size <= 0) {
            throw invalid("源图片不能为空");
        }
        if (size > MAX_IMAGE_BYTES) {
            throw invalid("源图片不能超过 20 MiB");
        }
    }

    private BusinessException invalid(String message) {
        return new BusinessException(ResultCode.BAD_REQUEST,
                "[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:VALIDATION] " + message);
    }

    private BusinessException unavailable(String message) {
        return new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                "[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:FAILED] " + message);
    }

    private record ResolvedImage(String base64, String contentType) {
    }
}
