package com.aetherflow.task.service;

import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskCompensationJob {

    private final TaskDispatchService taskDispatchService;

    @XxlJob("aetherFlowTaskCompensationJob")
    public void compensateTimeoutTasks() {
        log.info("xxl-job task compensation started");
        taskDispatchService.compensateTimeouts();
        log.info("xxl-job task compensation finished");
    }
}
