package com.aetherflow.ai.copilot.service;

import com.aetherflow.common.core.ErrorCode;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;

/** 携带一次失败的工作流规划请求对应的服务端会话标识。 */
public final class CopilotWorkflowPlanFailureException extends BusinessException {

    private final String conversationId;
    private final Throwable originalCause;
    private final boolean unexpectedFailure;

    private CopilotWorkflowPlanFailureException(ErrorCode errorCode, String message, String conversationId,
                                                Throwable originalCause, boolean unexpectedFailure) {
        super(errorCode, message);
        this.conversationId = conversationId;
        this.originalCause = originalCause;
        this.unexpectedFailure = unexpectedFailure;
    }

    public static CopilotWorkflowPlanFailureException from(RuntimeException failure, String conversationId) {
        if (failure instanceof BusinessException businessFailure) {
            return new CopilotWorkflowPlanFailureException(businessFailure.getErrorCode(), businessFailure.getMessage(),
                    conversationId, failure, false);
        }
        return new CopilotWorkflowPlanFailureException(ResultCode.INTERNAL_ERROR, ResultCode.INTERNAL_ERROR.getMessage(),
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
}
