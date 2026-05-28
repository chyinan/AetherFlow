package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class PersistentRuntimeEventPublisher implements RuntimeEventPublisher {

    private final RuntimeEventStore runtimeEventStore;

    @Override
    public void publish(RuntimeEvent event) {
        if (event == null || runtimeEventStore == null) {
            return;
        }
        runtimeEventStore.append(event);
    }
}
