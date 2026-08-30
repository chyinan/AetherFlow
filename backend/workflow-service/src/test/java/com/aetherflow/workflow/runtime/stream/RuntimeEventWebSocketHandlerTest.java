package com.aetherflow.workflow.runtime.stream;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RuntimeEventWebSocketHandlerTest {

    @Test
    void emitsRuntimeFramesFromTheSharedCursorReaderAndClosesAtTerminalState() throws Exception {
        RuntimeEvent event = RuntimeEvent.of(
                RuntimeEventType.WORKFLOW_COMPLETED,
                "1001",
                "trace-1",
                "task-1",
                "node-output",
                RuntimeState.SUCCESS,
                Instant.parse("2026-08-30T10:00:00Z"),
                Map.of()
        );
        RuntimeEventStreamService streamService = mock(RuntimeEventStreamService.class);
        when(streamService.eventsAfterCursor("1001", "event-1")).thenReturn(List.of(event));
        when(streamService.isTerminal(event)).thenReturn(true);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("session-1");
        when(session.getAttributes()).thenReturn(Map.of("workflowId", "1001", "cursor", "event-1"));
        when(session.isOpen()).thenReturn(true);
        WorkflowRuntimeWebSocketProperties properties = new WorkflowRuntimeWebSocketProperties();
        properties.setPollInterval(Duration.ofMillis(10));
        RuntimeEventWebSocketHandler handler = new RuntimeEventWebSocketHandler(
                streamService,
                new ObjectMapper().findAndRegisterModules(),
                properties,
                Executors.newSingleThreadScheduledExecutor()
        );

        handler.afterConnectionEstablished(session);

        var messageCaptor = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(session, timeout(1_000)).sendMessage(messageCaptor.capture());
        JsonNode frame = new ObjectMapper().readTree(messageCaptor.getValue().getPayload());
        assertThat(frame.get("event").asText()).isEqualTo("runtime-event");
        assertThat(frame.get("cursor").asText()).isEqualTo(event.eventId());
        assertThat(frame.get("data").get("eventType").asText()).isEqualTo("WORKFLOW_COMPLETED");
        verify(session, timeout(1_000)).close(any(CloseStatus.class));
        handler.shutdown();
    }
}
