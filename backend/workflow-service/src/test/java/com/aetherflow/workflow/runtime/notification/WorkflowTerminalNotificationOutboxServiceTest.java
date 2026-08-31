package com.aetherflow.workflow.runtime.notification;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class WorkflowTerminalNotificationOutboxServiceTest {

    @Test
    void enqueuesTerminalNotificationWithDeterministicIdempotencyKey() {
        WorkflowTerminalNotificationOutboxMapper mapper = mock(WorkflowTerminalNotificationOutboxMapper.class);
        WorkflowTerminalNotificationOutboxService service = new WorkflowTerminalNotificationOutboxService(
                mapper, mock(NotifyInternalClient.class), new ObjectMapper().registerModule(new JavaTimeModule()));

        service.enqueue(42L, 7L, "trace-42", RuntimeState.SUCCESS, "end");

        var captor = org.mockito.ArgumentCaptor.forClass(WorkflowTerminalNotificationOutbox.class);
        verify(mapper).insert(captor.capture());
        assertThat(captor.getValue().getEventId()).isEqualTo("workflow:42:SUCCESS");
        assertThat(captor.getValue().getStatus()).isEqualTo(WorkflowTerminalNotificationOutbox.PENDING);
        assertThat(captor.getValue().getPayloadJson()).contains("WORKFLOW_COMPLETED");
    }

    @Test
    void dispatchesOnlyRowsClaimedByThisReplica() throws Exception {
        WorkflowTerminalNotificationOutboxMapper mapper = mock(WorkflowTerminalNotificationOutboxMapper.class);
        NotifyInternalClient client = mock(NotifyInternalClient.class);
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        WorkflowTerminalNotificationOutboxService service = new WorkflowTerminalNotificationOutboxService(
                mapper, client, objectMapper);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(7L);
        message.setEventId("workflow:42:SUCCESS");
        message.setEventType("WORKFLOW_COMPLETED");
        WorkflowTerminalNotificationOutbox row = new WorkflowTerminalNotificationOutbox();
        row.setId(9L);
        row.setEventId(message.getEventId());
        row.setPayloadJson(objectMapper.writeValueAsString(message));
        when(mapper.selectDue(any(), any(), eq(100))).thenReturn(List.of(row));
        when(mapper.claim(eq(9L), any(), any())).thenReturn(1);
        when(client.send(any(NotifyMessageDTO.class))).thenReturn(Result.success());

        assertThat(service.dispatchDue()).isEqualTo(1);

        verify(client).send(any(NotifyMessageDTO.class));
        verify(mapper).markDispatched(eq(9L), any());
    }
}
