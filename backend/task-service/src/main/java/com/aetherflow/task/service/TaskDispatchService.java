package com.aetherflow.task.service;

import com.aetherflow.common.dto.TaskMessageDTO;

public interface TaskDispatchService {

    Long dispatch(TaskMessageDTO taskMessage);

    void markSucceeded(Long taskId);

    void compensateTimeouts();
}

