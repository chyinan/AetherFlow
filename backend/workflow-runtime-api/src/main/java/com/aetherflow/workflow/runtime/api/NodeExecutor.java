package com.aetherflow.workflow.runtime.api;

public interface NodeExecutor {

    NodeType nodeType();

    NodeResult execute(WorkflowContext context) throws Exception;

    /**
     * 是否允许运行时在失败后自动重试；外部副作用节点可拒绝重放。
     * 默认保留已有节点的工作流重试策略。
     */
    default boolean supportsAutomaticRetry() {
        return true;
    }
}
