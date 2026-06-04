package com.aetherflow.workflow.demo;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import io.seata.spring.annotation.GlobalTransactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class WorkflowSeataDemoService {

    private static final int MAX_HOLD_SECONDS = 30;

    private final WorkflowInstanceMapper instanceMapper;
    private final TaskClient taskClient;
    private final TaskClientProperties taskClientProperties;

    @GlobalTransactional(name = "aetherflow-demo-workflow-task", rollbackFor = Exception.class)
    public WorkflowSeataDemoResponse createDemoTransaction(int holdSeconds, boolean rollback) {
        WorkflowInstance instance = createWorkflowInstance();
        Long taskId = dispatchDemoTask(instance.getId());
        int boundedHoldSeconds = boundedHoldSeconds(holdSeconds);
        holdTransactionOpen(boundedHoldSeconds);
        if (rollback) {
            throw new WorkflowSeataRollbackDemoException(
                    new WorkflowSeataDemoResponse(instance.getId(), taskId, boundedHoldSeconds, true));
        }
        return new WorkflowSeataDemoResponse(instance.getId(), taskId, boundedHoldSeconds, false);
    }

    private WorkflowInstance createWorkflowInstance() {
        LocalDateTime now = LocalDateTime.now();
        WorkflowInstance instance = new WorkflowInstance();
        instance.setDefinitionId(-1L);
        instance.setUserId(0L);
        instance.setInputJson("{\"demo\":\"seata\"}");
        instance.setStatus(RuntimeState.RUNNING.name());
        instance.setCurrentNodeId("demo-seata-task");
        instance.setStartedAt(now);
        instance.setUpdatedAt(now);
        instanceMapper.insert(instance);
        return instance;
    }

    private Long dispatchDemoTask(Long workflowInstanceId) {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setWorkflowInstanceId(workflowInstanceId);
        message.setNodeId("demo-seata-task");
        message.setNodeType("SEATA_DEMO");
        message.setPayload(Map.of("source", "workflow-service", "demo", "seata"));
        message.setEnqueue(false);
        Result<Long> result = taskClient.dispatch(taskClientProperties.getInternalToken(), message);
        if (result == null || !result.isSuccess()) {
            String messageText = result == null ? "task-service returned null" : result.getMessage();
            throw new IllegalStateException("task-service dispatch failed: " + messageText);
        }
        return result.getData();
    }

    private int boundedHoldSeconds(int holdSeconds) {
        if (holdSeconds <= 0) {
            return 0;
        }
        return Math.min(holdSeconds, MAX_HOLD_SECONDS);
    }

    private void holdTransactionOpen(int holdSeconds) {
        if (holdSeconds <= 0) {
            return;
        }
        try {
            Thread.sleep(holdSeconds * 1000L);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Seata demo transaction hold interrupted", exception);
        }
    }
}
