package com.aetherflow.common.core;

public final class RabbitMqNames {

    public static final String TASK_EXCHANGE = "aetherflow.task.exchange";
    public static final String NOTIFY_EXCHANGE = "aetherflow.notify.exchange";

    public static final String AI_TASK_QUEUE = "aetherflow.ai.task.queue";
    public static final String AI_TASK_ROUTING_KEY = "task.ai";

    public static final String TASK_DEAD_LETTER_EXCHANGE = "aetherflow.task.dlx";
    public static final String TASK_DEAD_LETTER_QUEUE = "aetherflow.task.dlq";
    public static final String TASK_DEAD_LETTER_ROUTING_KEY = "task.dead";

    public static final String NOTIFY_QUEUE = "aetherflow.notify.queue";
    public static final String NOTIFY_ROUTING_KEY = "notify.user";

    private RabbitMqNames() {
    }
}

