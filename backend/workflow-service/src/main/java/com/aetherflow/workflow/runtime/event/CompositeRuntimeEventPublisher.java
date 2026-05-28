package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;

import java.util.List;

public class CompositeRuntimeEventPublisher implements RuntimeEventPublisher {

    private final List<RuntimeEventPublisher> publishers;

    public CompositeRuntimeEventPublisher(List<RuntimeEventPublisher> publishers) {
        this.publishers = publishers == null ? List.of() : List.copyOf(publishers);
    }

    @Override
    public void publish(RuntimeEvent event) {
        for (RuntimeEventPublisher publisher : publishers) {
            publisher.publish(event);
        }
    }
}
