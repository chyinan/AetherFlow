package com.aetherflow.ai.copilot.service;

import com.aetherflow.common.core.ErrorCode;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.http.HttpStatus;

/** A failed canvas-edit turn with the exact conversation prepared by the server. */
public final class CopilotCanvasEditFailureException extends BusinessException {

    private final String conversationId;
    private final Throwable originalCause;
    private final boolean unexpectedFailure;

    private CopilotCanvasEditFailureException(ErrorCode errorCode, String message, String conversationId,
                                              Throwable originalCause, boolean unexpectedFailure) {
        super(errorCode, message);
        this.conversationId = conversationId;
        this.originalCause = originalCause;
        this.unexpectedFailure = unexpectedFailure;
    }

    public static CopilotCanvasEditFailureException from(RuntimeException failure, String conversationId) {
        if (failure instanceof BusinessException businessFailure) {
            return new CopilotCanvasEditFailureException(businessFailure.getErrorCode(), businessFailure.getMessage(),
                    conversationId, failure, false);
        }
        return new CopilotCanvasEditFailureException(ResultCode.INTERNAL_ERROR, ResultCode.INTERNAL_ERROR.getMessage(),
                conversationId, failure, true);
    }

    public String getConversationId() {
        return conversationId;
    }

    public Throwable getOriginalCause() {
        return originalCause;
    }

    public boolean isUnexpectedFailure() {
        return unexpectedFailure;
    }

    public FailureMetadata getFailureMetadata() {
        return new FailureMetadata("canvas-edit-failure", conversationId);
    }

    public HttpStatus getHttpStatus() {
        int code = getErrorCode().getCode();
        if (code == ResultCode.UNAUTHORIZED.getCode()) return HttpStatus.UNAUTHORIZED;
        if (code == ResultCode.FORBIDDEN.getCode()) return HttpStatus.FORBIDDEN;
        if (code == ResultCode.NOT_FOUND.getCode()) return HttpStatus.NOT_FOUND;
        if (code == ResultCode.CONFLICT.getCode()) return HttpStatus.CONFLICT;
        if (code == ResultCode.TOO_MANY_REQUESTS.getCode()) return HttpStatus.TOO_MANY_REQUESTS;
        if (code == ResultCode.SERVICE_UNAVAILABLE.getCode()) return HttpStatus.SERVICE_UNAVAILABLE;
        if (code >= 40000 && code < 50000 || code == ResultCode.BAD_REQUEST.getCode()) return HttpStatus.BAD_REQUEST;
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    public record FailureMetadata(String type, String conversationId) {
    }
}
