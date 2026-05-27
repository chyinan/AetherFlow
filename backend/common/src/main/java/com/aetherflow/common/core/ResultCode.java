package com.aetherflow.common.core;

import lombok.Getter;

@Getter
public enum ResultCode implements ErrorCode {

    SUCCESS(0, "success"),
    BAD_REQUEST(400, "bad request"),
    VALIDATION_FAILED(40001, "validation failed"),
    UNAUTHORIZED(401, "unauthorized"),
    FORBIDDEN(403, "forbidden"),
    NOT_FOUND(404, "not found"),
    CONFLICT(409, "conflict"),
    TOO_MANY_REQUESTS(429, "too many requests"),
    INTERNAL_ERROR(500, "internal server error"),
    SERVICE_UNAVAILABLE(503, "service unavailable");

    private final int code;
    private final String message;

    ResultCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
