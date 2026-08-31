package com.aetherflow.common.core;

// pattern: Functional Core

public final class RabbitMqNames {

    public static final String TASK_EXCHANGE = "aetherflow.task.exchange";
    public static final String NOTIFY_EXCHANGE = "aetherflow.notify.exchange";

    public static final String AI_TASK_QUEUE = "aetherflow.ai.task.queue";
    public static final String AI_TASK_ROUTING_KEY = "task.ai";
    public static final String AI_TASK_RETRY_EXCHANGE = "aetherflow.ai.task.retry.exchange";
    public static final String AI_TASK_RETRY_SHORT_QUEUE = "aetherflow.ai.task.retry.5s.queue";
    public static final String AI_TASK_RETRY_MEDIUM_QUEUE = "aetherflow.ai.task.retry.30s.queue";
    public static final String AI_TASK_RETRY_LONG_QUEUE = "aetherflow.ai.task.retry.120s.queue";
    public static final String AI_TASK_RETRY_SHORT_ROUTING_KEY = "task.ai.retry.5s";
    public static final String AI_TASK_RETRY_MEDIUM_ROUTING_KEY = "task.ai.retry.30s";
    public static final String AI_TASK_RETRY_LONG_ROUTING_KEY = "task.ai.retry.120s";

    public static final String TASK_DEAD_LETTER_EXCHANGE = "aetherflow.task.dlx";
    public static final String TASK_DEAD_LETTER_QUEUE = "aetherflow.task.dlq";
    public static final String TASK_DEAD_LETTER_ROUTING_KEY = "task.dead";

    public static final String NOTIFY_QUEUE = "aetherflow.notify.queue";
    public static final String WORKFLOW_AI_RESULT_QUEUE = "aetherflow.workflow.ai-result.queue";
    public static final String NOTIFY_ROUTING_KEY = "notify.user";

    private RabbitMqNames() {
    }
}

