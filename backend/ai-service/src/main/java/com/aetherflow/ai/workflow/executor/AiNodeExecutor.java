package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;

public interface AiNodeExecutor {

    String nodeType();

    AiNodeResult execute(AiNodeExecutionContext context);
}
