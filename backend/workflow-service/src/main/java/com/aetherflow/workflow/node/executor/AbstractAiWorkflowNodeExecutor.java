package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.WorkflowContext;

import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

// pattern: Imperative Shell
abstract class AbstractAiWorkflowNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;

    @Autowired(required = false)
    private AiNodeCallTimeoutGuard aiCallTimeoutGuard;

    @Autowired(required = false)
    private AsyncAiTaskDispatcher asyncAiTaskDispatcher;

    protected AbstractAiWorkflowNodeExecutor(NodeType nodeType,
                                             WorkflowNodeMetrics metrics,
                                             AiWorkflowNodeClient aiClient) {
        super(nodeType, metrics);
        this.aiClient = aiClient;
    }

    protected AiWorkflowNodeResponseDTO executeAi(WorkflowContext context,
                                                   String nodeType,
                                                   Map<String, Object> payload) {
        if (asyncAiTaskDispatcher != null && asyncAiTaskDispatcher.isEnabled()) {
            long externalTaskId = asyncAiTaskDispatcher.dispatch(context, nodeType, payload);
            throw new NodeWaitingException(Map.of("externalTaskId", externalTaskId));
        }
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType(nodeType);
        request.setPayload(payload == null ? Map.of() : Map.copyOf(payload));
        Result<AiWorkflowNodeResponseDTO> result = callAiWithTimeout(request, nodeType);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    nodeType.toLowerCase() + " node ai execution failed");
        }
        return result.getData();
    }

    private Result<AiWorkflowNodeResponseDTO> callAiWithTimeout(AiWorkflowNodeRequestDTO request, String nodeType) {
        // 单元测试场景下不经 Spring 容器创建执行器，aiCallTimeoutGuard 为 null，此处降级为直接调用。
        if (aiCallTimeoutGuard == null) {
            return aiClient.execute(request);
        }
        return aiCallTimeoutGuard.executeWithTimeout(() -> aiClient.execute(request), nodeType);
    }

    protected NodeResult aiResult(AiWorkflowNodeResponseDTO response) {
        Map<String, Object> output = response.getOutput() == null ? Map.of() : response.getOutput();
        return AiWorkflowNodeResultAdapter.adapt(nodeType().value(), output);
    }
}
