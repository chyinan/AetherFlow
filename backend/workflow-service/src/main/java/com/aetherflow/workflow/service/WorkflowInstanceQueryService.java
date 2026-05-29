package com.aetherflow.workflow.service;

import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;

import java.util.List;

public interface WorkflowInstanceQueryService {

    RunPageResponse listInstances(String workflowId, String status, int page, int pageSize);

    RunView getInstance(Long id);

    List<LogFrame> logs(Long id);
}
