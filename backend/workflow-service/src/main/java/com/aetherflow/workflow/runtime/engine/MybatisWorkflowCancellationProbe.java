package com.aetherflow.workflow.runtime.engine;

// pattern: Imperative Shell

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MybatisWorkflowCancellationProbe implements WorkflowCancellationProbe {

    private final WorkflowInstanceMapper mapper;

    @Override
    public boolean isCancelled(String workflowId) {
        try {
            long id = Long.parseLong(workflowId);
            WorkflowInstance instance = mapper.selectById(id);
            return instance != null && "CANCELLED".equals(instance.getStatus());
        } catch (RuntimeException exception) {
            return true;
        }
    }
}
