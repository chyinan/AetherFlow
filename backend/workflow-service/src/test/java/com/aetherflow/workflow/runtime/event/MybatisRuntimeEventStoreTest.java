package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.mapper.WorkflowRuntimeEventMapper;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MybatisRuntimeEventStoreTest {

    @Mock
    private WorkflowRuntimeEventMapper mapper;

    private MybatisRuntimeEventStore store;

    @BeforeEach
    void setUp() {
        store = new MybatisRuntimeEventStore(mapper, new ObjectMapper().findAndRegisterModules());
    }

    @Test
    void appendsRuntimeEventAsJsonEntity() {
        RuntimeEvent event = event("event-1", RuntimeEventType.NODE_RETRYING, "node-a",
                RuntimeState.RETRYING, Map.of("attempt", 2, "error", "timeout"));

        store.append(event);

        ArgumentCaptor<RuntimeEventEntity> entityCaptor = ArgumentCaptor.forClass(RuntimeEventEntity.class);
        verify(mapper).insert(entityCaptor.capture());
        RuntimeEventEntity entity = entityCaptor.getValue();
        assertThat(entity.getEventId()).isEqualTo("event-1");
        assertThat(entity.getWorkflowId()).isEqualTo("workflow-1");
        assertThat(entity.getEventType()).isEqualTo("NODE_RETRYING");
        assertThat(entity.getRuntimeState()).isEqualTo("RETRYING");
        assertThat(entity.getNodeId()).isEqualTo("node-a");
        assertThat(entity.getAttributesJson()).contains("\"attempt\":2");
    }

    @Test
    void queriesEventsByWorkflowIdInOccurrenceOrder() {
        when(mapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                entity(event("event-1", RuntimeEventType.WORKFLOW_STARTED, null,
                        RuntimeState.RUNNING, Map.of("totalNodes", 2))),
                entity(event("event-2", RuntimeEventType.NODE_COMPLETED, "node-a",
                        RuntimeState.RUNNING, Map.of("nodeType", "INPUT")))
        ));

        List<RuntimeEvent> events = store.findByWorkflowId("workflow-1");

        assertThat(events).extracting(RuntimeEvent::eventId).containsExactly("event-1", "event-2");
        assertThat(events.get(0).attributes()).containsEntry("totalNodes", 2);
        assertThat(events.get(1).nodeId()).isEqualTo("node-a");
        verify(mapper).selectList(any(Wrapper.class));
    }

    private static RuntimeEventEntity entity(RuntimeEvent event) {
        RuntimeEventEntity entity = new RuntimeEventEntity();
        entity.setId("event-2".equals(event.eventId()) ? 2L : 1L);
        entity.setEventId(event.eventId());
        entity.setWorkflowId(event.workflowId());
        entity.setTraceId(event.traceId());
        entity.setTaskId(event.taskId());
        entity.setEventType(event.eventType().name());
        entity.setNodeId(event.nodeId());
        entity.setRuntimeState(event.runtimeState().name());
        entity.setOccurredAt(LocalDateTime.parse("2026-05-28T12:00:00").plusSeconds(entity.getId()));
        entity.setAttributesJson(event.attributes().containsKey("totalNodes")
                ? "{\"totalNodes\":2}"
                : "{\"nodeType\":\"INPUT\"}");
        entity.setCreatedAt(LocalDateTime.parse("2026-05-28T12:00:10"));
        return entity;
    }

    private static RuntimeEvent event(String eventId,
                                      RuntimeEventType eventType,
                                      String nodeId,
                                      RuntimeState runtimeState,
                                      Map<String, Object> attributes) {
        return new RuntimeEvent(eventId, eventType, "workflow-1", "trace-1", "task-1", nodeId,
                runtimeState, Instant.parse("2026-05-28T12:00:00Z"), attributes);
    }
}
