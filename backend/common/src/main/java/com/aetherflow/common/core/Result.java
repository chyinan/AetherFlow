package com.aetherflow.common.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Unified API response envelope.")
public class Result<T> {

    @Schema(description = "Business result code. 0 means success.", example = "0")
    private int code;

    @Schema(description = "Human readable result message.", example = "success")
    private String message;

    @Schema(description = "Response payload.")
    private T data;

    @Schema(description = "Server response timestamp.")
    private OffsetDateTime timestamp;

    @Schema(description = "Request trace id for log correlation.", example = "0f9f8c6b7a1e4f48")
    private String traceId;

    @Schema(description = "Request path.", example = "/health")
    private String path;

    public static <T> Result<T> success() {
        return success(null);
    }

    public static <T> Result<T> success(T data) {
        return of(ResultCode.SUCCESS.getCode(), ResultCode.SUCCESS.getMessage(), data);
    }

    public static <T> Result<T> fail(ErrorCode errorCode) {
        return of(errorCode.getCode(), errorCode.getMessage(), null);
    }

    public static <T> Result<T> fail(ErrorCode errorCode, String message) {
        return of(errorCode.getCode(), message, null);
    }

    public static <T> Result<T> of(int code, String message, T data) {
        return new Result<>(code, message, data, OffsetDateTime.now(), null, null);
    }

    public boolean isSuccess() {
        return code == ResultCode.SUCCESS.getCode();
    }

    public Result<T> withRequestContext(String traceId, String path) {
        this.traceId = traceId;
        this.path = path;
        return this;
    }
}
