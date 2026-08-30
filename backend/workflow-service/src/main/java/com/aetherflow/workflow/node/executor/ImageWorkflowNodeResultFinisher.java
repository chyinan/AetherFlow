package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.api.NodeResult;

import java.util.Map;

/**
 * 将异步图像任务返回的模型结果转换为工作流可消费的节点结果。
 * 图像结果需要先落入文件服务，不能把 base64 数据直接写入运行时变量。
 */
public interface ImageWorkflowNodeResultFinisher {

    boolean supports(String nodeType);

    NodeResult finish(String nodeType,
                      String workflowId,
                      String nodeId,
                      Map<String, Object> variables,
                      Map<String, Object> output);
}
