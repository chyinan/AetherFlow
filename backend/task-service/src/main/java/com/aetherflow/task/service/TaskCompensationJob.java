package com.aetherflow.task.service;

import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class TaskCompensationJob {

    private final TaskDispatchService taskDispatchService;

    @XxlJob("aetherFlowTaskCompensationJob")
    public void compensateTimeoutTasks() {
        taskDispatchService.compensateTimeouts();
    }
}

