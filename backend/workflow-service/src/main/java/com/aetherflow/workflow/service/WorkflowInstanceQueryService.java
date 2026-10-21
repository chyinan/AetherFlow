package com.aetherflow.workflow.service;

import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;

import java.util.List;

public interface WorkflowInstanceQueryService {

    RunPageResponse listInstances(String workflowId, String status, int page, int pageSize);

    /**
     * 按工作流定义 ID 精确筛选的列表查询。
     *
     * @param definitionId 工作流定义 ID，精确匹配；为空时沿用 workflowId 的兼容行为
     */
    RunPageResponse listInstances(String workflowId, Long definitionId, String status, int page, int pageSize);

    RunView getInstance(Long id);

    List<LogFrame> logs(Long id);
}
