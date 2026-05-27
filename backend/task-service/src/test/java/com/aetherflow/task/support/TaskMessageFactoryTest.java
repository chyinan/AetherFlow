package com.aetherflow.task.support;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.entity.Task;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TaskMessageFactoryTest {

    private final TaskMessageFactory taskMessageFactory = new TaskMessageFactory(new ObjectMapper().findAndRegisterModules());

    @Test
    void createsMessageFromTaskRecord() {
        Task task = new Task();
        task.setId(11L);
        task.setWorkflowInstanceId(22L);
        task.setNodeId("node-1");
        task.setNodeType("AI_TRANSCRIPTION");
        task.setPayloadJson("{\"fileUrl\":\"https://example.test/video.mp4\",\"language\":\"zh\"}");
        task.setRetryCount(2);
        task.setCreatedAt(LocalDateTime.of(2026, 5, 27, 20, 0));

        TaskMessageDTO message = taskMessageFactory.from(task);

        assertThat(message.getTaskId()).isEqualTo(11L);
        assertThat(message.getWorkflowInstanceId()).isEqualTo(22L);
        assertThat(message.getNodeId()).isEqualTo("node-1");
        assertThat(message.getNodeType()).isEqualTo("AI_TRANSCRIPTION");
        assertThat(message.getRetryCount()).isEqualTo(2);
        assertThat(message.getPayload()).containsEntry("fileUrl", "https://example.test/video.mp4")
                .containsEntry("language", "zh");
        assertThat(message.getCreatedAt()).isNotNull();
    }

    @Test
    void writesEmptyPayloadWhenPayloadIsNull() {
        String payloadJson = taskMessageFactory.writePayload(null);

        assertThat(payloadJson).isEqualTo("{}");
    }

    @Test
    void writesPayloadMapAsJson() {
        String payloadJson = taskMessageFactory.writePayload(Map.of("node", "n1"));

        assertThat(payloadJson).contains("\"node\":\"n1\"");
    }
}
