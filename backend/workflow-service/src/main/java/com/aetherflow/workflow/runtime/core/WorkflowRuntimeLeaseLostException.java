package com.aetherflow.workflow.runtime.core;

// pattern: Functional Core

/**
 * 表示当前工作流执行器已经失去分布式租约或数据库 fencing token。
 * 失去租约的执行器不得再推进工作流投影或发送终态通知，必须交给恢复扫描器接管。
 */
public final class WorkflowRuntimeLeaseLostException extends IllegalStateException {

    public WorkflowRuntimeLeaseLostException(String message) {
        super(message);
    }
}
