package com.aetherflow.workflow.runtime.controller;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.stream.RuntimeEventStreamService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class WorkflowRuntimeControllerTest {

    @Test
    void returnsRuntimeMetrics() throws Exception {
        WorkflowRuntimeMetrics metrics = new WorkflowRuntimeMetrics(Instant.parse("2026-05-28T09:00:00Z"));
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore();
        metrics.publish(event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null, Map.of()));
        metrics.publish(event(RuntimeEventType.NODE_RETRYING, RuntimeState.RETRYING, "node-a", Map.of()));

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new WorkflowRuntimeController(metrics, store, emptyEventStore())).build();

        mockMvc.perform(get("/workflow/runtime/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.currentWorkflowCount").value(1))
                .andExpect(jsonPath("$.data.retryCount").value(1));
    }

    @Test
    void returnsRuntimeObservationAndEvents() throws Exception {
        WorkflowRuntimeMetrics metrics = new WorkflowRuntimeMetrics();
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore();
        store.publish(event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null, Map.of("totalNodes", 1)));
        store.publish(event(RuntimeEventType.NODE_STARTED, RuntimeState.RUNNING, "node-a", Map.of()));
        store.publish(event(RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING, "node-a", Map.of()));

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new WorkflowRuntimeController(metrics, store, eventStore(
                event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null, Map.of("totalNodes", 1)),
                event(RuntimeEventType.NODE_STARTED, RuntimeState.RUNNING, "node-a", Map.of()),
                event(RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING, "node-a", Map.of())
        ))).build();

        mockMvc.perform(get("/workflow/runtime/observability/workflow-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.workflowId").value("workflow-1"))
                .andExpect(jsonPath("$.data.currentNodeId").value("node-a"))
                .andExpect(jsonPath("$.data.progress").value(1.0D));

        mockMvc.perform(get("/workflow/runtime/events/workflow-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(3)))
                .andExpect(jsonPath("$.data[0].eventType").value("WORKFLOW_STARTED"));
    }

    @Test
    void rebuildsRuntimeObservationFromPersistentEventsWhenMemoryStoreIsEmpty() throws Exception {
        WorkflowRuntimeMetrics metrics = new WorkflowRuntimeMetrics();
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore();
        RuntimeEventStore eventStore = eventStore(
                event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null, Map.of("totalNodes", 2)),
                event(RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING, "node-a", Map.of()),
                event(RuntimeEventType.WORKFLOW_COMPLETED, RuntimeState.SUCCESS, "node-a", Map.of())
        );

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new WorkflowRuntimeController(metrics, store, eventStore)).build();

        mockMvc.perform(get("/workflow/runtime/observability/workflow-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.workflowId").value("workflow-1"))
                .andExpect(jsonPath("$.data.runtimeState").value("SUCCESS"))
                .andExpect(jsonPath("$.data.completedNodeCount").value(1))
                .andExpect(jsonPath("$.data.progress").value(1.0D));

        mockMvc.perform(get("/workflow/runtime/events/workflow-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(3)))
                .andExpect(jsonPath("$.data[2].eventType").value("WORKFLOW_COMPLETED"));
    }

    @Test
    void opensRuntimeEventStreamWithCursorRecovery() throws Exception {
        WorkflowRuntimeMetrics metrics = new WorkflowRuntimeMetrics();
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore();
        RuntimeEventStore eventStore = emptyEventStore();
        RuntimeEventStreamService streamService = mock(RuntimeEventStreamService.class);
        SseEmitter emitter = new SseEmitter(1000L);
        when(streamService.stream("workflow-1", "event-1", "event-2")).thenReturn(emitter);

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(
                new WorkflowRuntimeController(metrics, store, eventStore, streamService)
        ).build();

        mockMvc.perform(get("/workflow/runtime/stream/workflow-1")
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .header("Last-Event-ID", "event-1")
                        .param("cursor", "event-2"))
                .andExpect(request().asyncStarted());

        verify(streamService).stream("workflow-1", "event-1", "event-2");
        emitter.complete();
    }

    private static RuntimeEvent event(RuntimeEventType eventType,
                                      RuntimeState state,
                                      String nodeId,
                                      Map<String, Object> attributes) {
        return RuntimeEvent.of(eventType, "workflow-1", "trace-1", "task-1", nodeId, state,
                Instant.parse("2026-05-28T09:00:00Z"), attributes);
    }

    private static RuntimeEventStore emptyEventStore() {
        return eventStore();
    }

    private static RuntimeEventStore eventStore(RuntimeEvent... events) {
        List<RuntimeEvent> eventList = List.of(events);
        return new RuntimeEventStore() {
            @Override
            public void append(RuntimeEvent event) {
            }

            @Override
            public List<RuntimeEvent> findByWorkflowId(String workflowId) {
                return eventList.stream()
                        .filter(event -> event.workflowId().equals(workflowId))
                        .toList();
            }
        };
    }
}
