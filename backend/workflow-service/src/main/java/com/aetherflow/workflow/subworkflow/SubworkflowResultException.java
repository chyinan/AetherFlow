package com.aetherflow.workflow.subworkflow;

/** 子流程已明确失败或其输出不满足调用契约；基础设施异常应保留收据重试。 */
public class SubworkflowResultException extends RuntimeException {
    public SubworkflowResultException(String message) { super(message); }
    public SubworkflowResultException(String message, Throwable cause) { super(message, cause); }
}
