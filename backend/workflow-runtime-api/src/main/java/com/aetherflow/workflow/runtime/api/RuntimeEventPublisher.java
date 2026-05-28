package com.aetherflow.workflow.runtime.api;

public interface RuntimeEventPublisher {

    void publish(RuntimeEvent event);
}
