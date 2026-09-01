package com.aetherflow.task.service;

// pattern: Imperative Shell

import com.aetherflow.common.dto.TaskMessageDTO;

public interface TaskDispatchService {

    Long dispatch(TaskMessageDTO taskMessage);

    void markSucceeded(Long taskId);

    void markFailed(Long taskId);

    int cancelActiveByWorkflowInstance(Long workflowInstanceId);

    String status(Long taskId);

    void compensateTimeouts();
}

