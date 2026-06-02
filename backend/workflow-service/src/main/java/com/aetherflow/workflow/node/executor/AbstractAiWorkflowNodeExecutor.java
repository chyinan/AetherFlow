package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.WorkflowContext;

import java.util.LinkedHashMap;
import java.util.Map;

abstract class AbstractAiWorkflowNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;

    protected AbstractAiWorkflowNodeExecutor(NodeType nodeType,
                                             WorkflowNodeMetrics metrics,
                                             AiWorkflowNodeClient aiClient) {
        super(nodeType, metrics);
        this.aiClient = aiClient;
    }

    protected AiWorkflowNodeResponseDTO executeAi(WorkflowContext context,
                                                  String nodeType,
                                                  Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType(nodeType);
        request.setPayload(payload == null ? Map.of() : Map.copyOf(payload));
        Result<AiWorkflowNodeResponseDTO> result = aiClient.execute(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    nodeType.toLowerCase() + " node ai execution failed");
        }
        return result.getData();
    }

    protected NodeResult aiResult(AiWorkflowNodeResponseDTO response, Map<String, Object> variables) {
        Map<String, Object> output = response.getOutput() == null ? Map.of() : response.getOutput();
        Map<String, Object> mergedVariables = new LinkedHashMap<>();
        if (variables != null) {
            mergedVariables.putAll(variables);
        }
        copyIfPresent(output, mergedVariables, "completionText", "completionText");
        copyIfPresent(output, mergedVariables, "completionText", "completion");
        copyIfPresent(output, mergedVariables, "translatedText", "translatedText");
        copyIfPresent(output, mergedVariables, "jsonData", "jsonData");
        copyIfPresent(output, mergedVariables, "provider", "provider");
        copyIfPresent(output, mergedVariables, "model", "model");
        return buildResult(output, mergedVariables);
    }

    protected void copyIfPresent(Map<String, Object> source,
                                 Map<String, Object> target,
                                 String sourceKey,
                                 String targetKey) {
        if (source.get(sourceKey) != null) {
            target.put(targetKey, source.get(sourceKey));
        }
    }
}
