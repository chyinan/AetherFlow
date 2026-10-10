package com.aetherflow.ai.image;

// pattern: Functional Core
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.util.Locale;
import java.util.Map;

/**
 * 将服务端错误转换为封闭的诊断协议；不拼接响应正文、异常消息或用户输入。
 */
final class ImageExecutionFailure {

    enum Provider { COMFYUI, SD_WEBUI }
    enum Stage { INPUT, UPLOAD, QUEUE, POLL, GENERATION, DOWNLOAD, REQUEST, OUTPUT }
    enum Field { sourceImage, workflow, checkpoint, sampler, scheduler, vae, lora, upscaler,
        timeoutSeconds, connectionId, seed, mode }
    enum Reason { VALIDATION, HTTP, UNREACHABLE, TIMEOUT, INTERRUPTED, REJECTED, FAILED, EMPTY, INVALID_RESPONSE }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_ERROR_BODY_BYTES = 65_536;

    private ImageExecutionFailure() {
    }

    static BusinessException input(Provider provider, Field field) {
        return failure(provider, Stage.INPUT, field, Reason.VALIDATION);
    }

    static BusinessException failure(Provider provider, Stage stage, Field field, Reason reason) {
        ResultCode code = stage == Stage.INPUT || reason == Reason.VALIDATION || reason == Reason.REJECTED
                ? ResultCode.BAD_REQUEST : ResultCode.SERVICE_UNAVAILABLE;
        String providerLabel = provider == Provider.COMFYUI ? "ComfyUI" : "Stable Diffusion WebUI";
        String stageLabel = switch (stage) {
            case INPUT -> "输入检查";
            case UPLOAD -> "源图上传";
            case QUEUE -> "队列提交";
            case POLL -> "状态查询";
            case GENERATION -> "图像生成";
            case DOWNLOAD -> "结果下载";
            case REQUEST -> "生成请求";
            case OUTPUT -> "输出检查";
        };
        String reasonLabel = switch (reason) {
            case VALIDATION -> "参数校验未通过";
            case HTTP -> "服务返回 HTTP 错误";
            case UNREACHABLE -> "无法连接服务";
            case TIMEOUT -> "等待超时";
            case INTERRUPTED -> "执行已中断";
            case REJECTED -> "服务拒绝了工作流";
            case FAILED -> "服务端执行失败";
            case EMPTY -> "未收到图像结果";
            case INVALID_RESPONSE -> "服务响应格式不正确";
        };
        String suggestion = switch (field) {
            case sourceImage -> "请检查源图是否有效，并重新选择或上传图片。";
            case checkpoint -> "请刷新模型能力列表，并重新选择可用的检查点。";
            case sampler -> "请刷新能力列表，并重新选择可用的采样器。";
            case scheduler -> "请刷新能力列表，并重新选择可用的调度器。";
            case vae -> "请刷新模型能力列表，并检查 VAE 选择与工作流是否匹配。";
            case lora -> "请刷新模型能力列表，并检查 LoRA 名称与权重。";
            case upscaler -> "请刷新能力列表，并重新选择可用的放大方法。";
            case timeoutSeconds -> "请检查服务负载，并按需增加节点的超时时间。";
            case connectionId -> "请检查所选连接、服务状态和连接配置。";
            case seed -> "种子必须为 -1 或非负整数，请修改种子后重试。";
            case mode -> "请选择当前图像服务支持的生成模式。";
            case workflow -> stage == Stage.OUTPUT || stage == Stage.DOWNLOAD
                    ? "请检查工作流的图像输出节点，并在服务端确认结果是否可用。"
                    : "请检查工作流节点、参数和模型配置，并在服务端查看任务状态。";
        };
        if (reason == Reason.TIMEOUT || reason == Reason.INTERRUPTED) {
            suggestion += "原任务可能仍在服务端运行，请先确认任务状态，再决定是否重试或取消。";
        }
        return new BusinessException(code, "[IMAGE_EXECUTION:" + provider + ":" + stage + ":" + field + ":"
                + reason + "] " + providerLabel + " " + stageLabel + "失败：" + reasonLabel + "。" + suggestion);
    }

    static BusinessException fromRest(Provider provider, Stage stage, RestClientException exception) {
        // 只检查异常类型，不根据可能包含 URL、令牌或服务器正文的异常消息分类。
        Throwable cause = exception;
        for (int depth = 0; cause != null && depth < 32; depth++, cause = cause.getCause()) {
            if (cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException) {
                return failure(provider, stage, Field.timeoutSeconds, Reason.TIMEOUT);
            }
            if (cause instanceof java.io.InterruptedIOException || cause instanceof InterruptedException) {
                return failure(provider, stage, Field.workflow, Reason.INTERRUPTED);
            }
        }
        if (exception instanceof RestClientResponseException response) {
            JsonNode body = safeErrorBody(response);
            int status = response.getStatusCode().value();
            if (provider == Provider.COMFYUI && stage == Stage.QUEUE && status >= 400 && status < 500) {
                BusinessException rejected = queueRejection(body);
                if (rejected != null) {
                    return rejected;
                }
            }
            if (provider == Provider.SD_WEBUI && (status == 400 || status == 422)) {
                return failure(provider, stage, sdValidationField(body), Reason.VALIDATION);
            }
            return failure(provider, stage, Field.connectionId, Reason.HTTP);
        }
        if (exception instanceof ResourceAccessException) {
            return failure(provider, stage, Field.connectionId, Reason.UNREACHABLE);
        }
        return failure(provider, stage, Field.workflow, Reason.INVALID_RESPONSE);
    }

    static BusinessException queueRejection(JsonNode body) {
        JsonNode nodes = body.path("node_errors");
        if (nodes.isObject() && !nodes.isEmpty()) {
            Field fallback = Field.workflow;
            for (JsonNode node : nodes) {
                for (JsonNode error : node.path("errors")) {
                    Field field = namedField(error.path("extra_info").path("input_name").asText());
                    if (field == Field.workflow) {
                        field = namedField(error.path("input_name").asText());
                    }
                    if (field != Field.workflow) {
                        return failure(Provider.COMFYUI, Stage.QUEUE, field, Reason.REJECTED);
                    }
                }
                if (fallback == Field.workflow) {
                    fallback = nodeField(node.path("class_type").asText());
                }
            }
            return failure(Provider.COMFYUI, Stage.QUEUE, fallback, Reason.REJECTED);
        }
        if (body.hasNonNull("error")) {
            return failure(Provider.COMFYUI, Stage.QUEUE, Field.workflow, Reason.REJECTED);
        }
        return null;
    }

    static BusinessException historyFailure(Map<?, ?> promptHistory) {
        Object rawStatus = promptHistory.get("status");
        if (!(rawStatus instanceof Map<?, ?> status)) {
            return null;
        }
        Object rawMessages = status.get("messages");
        if (rawMessages instanceof Iterable<?> messages) {
            for (Object rawMessage : messages) {
                if (!(rawMessage instanceof java.util.List<?> message) || message.isEmpty()) {
                    continue;
                }
                Object event = message.get(0);
                if ("execution_interrupted".equals(event)) {
                    return failure(Provider.COMFYUI, Stage.GENERATION, Field.workflow, Reason.INTERRUPTED);
                }
                if ("execution_error".equals(event)) {
                    Field field = message.size() > 1 && message.get(1) instanceof Map<?, ?> detail
                            ? nodeField(detail.get("node_type")) : Field.workflow;
                    return failure(Provider.COMFYUI, Stage.GENERATION, field, Reason.FAILED);
                }
            }
        }
        if ("error".equals(status.get("status_str"))) {
            return failure(Provider.COMFYUI, Stage.GENERATION, Field.workflow, Reason.FAILED);
        }
        return null;
    }

    private static JsonNode safeErrorBody(RestClientResponseException response) {
        byte[] bytes = response.getResponseBodyAsByteArray();
        if (bytes.length > 0 && bytes.length <= MAX_ERROR_BODY_BYTES) {
            try {
                JsonNode body = MAPPER.readTree(bytes);
                if (body != null && body.isObject()) {
                    return body;
                }
            } catch (java.io.IOException ignored) {
                // 非 JSON 错误按 HTTP 状态分类，不保留或转发原文。
            }
        }
        return MAPPER.createObjectNode();
    }

    private static Field sdValidationField(JsonNode body) {
        for (JsonNode detail : body.path("detail")) {
            for (JsonNode location : detail.path("loc")) {
                Field field = namedField(location.asText());
                if (field != Field.workflow) {
                    return field;
                }
            }
        }
        return Field.workflow;
    }

    private static Field namedField(String name) {
        return switch (name) {
            case "ckpt_name", "unet_name", "sd_model_checkpoint", "checkpoint" -> Field.checkpoint;
            case "sampler_name", "sampler_index", "sampler" -> Field.sampler;
            case "scheduler" -> Field.scheduler;
            case "vae_name", "sd_vae", "vae" -> Field.vae;
            case "lora_name", "lora", "strength_model", "strength_clip" -> Field.lora;
            case "upscale_method", "upscaler_1", "upscaler_2", "upscaler" -> Field.upscaler;
            case "image", "init_images", "sourceImage" -> Field.sourceImage;
            case "seed", "noise_seed" -> Field.seed;
            case "mode" -> Field.mode;
            default -> Field.workflow;
        };
    }

    private static Field nodeField(Object nodeType) {
        if (!(nodeType instanceof String name)) {
            return Field.workflow;
        }
        return switch (name.toLowerCase(Locale.ROOT)) {
            case "checkpointloadersimple", "checkpointloader", "unetloader" -> Field.checkpoint;
            case "ksamplerselect" -> Field.sampler;
            case "basicscheduler" -> Field.scheduler;
            case "vaeloader", "vaeencode", "vaedecode", "vaeencodetiled", "vaedecodetiled" -> Field.vae;
            case "loraloader", "loraloadermodelonly" -> Field.lora;
            case "upscalemodelloader", "imageupscalewithmodel", "imagescaleby", "imagescale" -> Field.upscaler;
            case "loadimage" -> Field.sourceImage;
            default -> Field.workflow;
        };
    }
}
