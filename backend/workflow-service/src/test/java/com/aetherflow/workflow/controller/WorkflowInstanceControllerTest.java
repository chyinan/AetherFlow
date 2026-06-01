package com.aetherflow.workflow.controller;

import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.NodeSummary;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;
import com.aetherflow.workflow.service.WorkflowInstanceQueryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class WorkflowInstanceControllerTest {

    @Mock
    private WorkflowInstanceQueryService queryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new WorkflowInstanceController(queryService)).build();
    }

    @Test
    void listsWorkflowInstances() throws Exception {
        when(queryService.listInstances("10", "SUCCESS", 2, 20))
                .thenReturn(new RunPageResponse(2, 20, 1, List.of(runView())));

        mockMvc.perform(get("/workflow-instances")
                        .param("workflowId", "10")
                        .param("status", "SUCCESS")
                        .param("page", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(99))
                .andExpect(jsonPath("$.data.items[0].traceId").value("trace-1"))
                .andExpect(jsonPath("$.data.items[0].nodes[0].nodeId").value("node-summary"));

        verify(queryService).listInstances("10", "SUCCESS", 2, 20);
    }

    @Test
    void returnsWorkflowInstanceDetail() throws Exception {
        when(queryService.getInstance(99L)).thenReturn(runView());

        mockMvc.perform(get("/workflow-instances/99"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value(99))
                .andExpect(jsonPath("$.data.runtimeWorkflowId").value("99"));
    }

    @Test
    void returnsWorkflowInstanceLogs() throws Exception {
        when(queryService.logs(99L)).thenReturn(List.of(logFrame()));

        mockMvc.perform(get("/workflow-instances/99/logs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].level").value("warn"))
                .andExpect(jsonPath("$.data[0].nodeId").value("node-summary"));
    }

    private static RunView runView() {
        return new RunView(
                99L,
                10L,
                "10",
                "Meeting summary",
                "99",
                7L,
                "SUCCESS",
                "node-summary",
                "trace-1",
                LocalDateTime.parse("2026-05-29T09:00:00"),
                LocalDateTime.parse("2026-05-29T09:01:00"),
                LocalDateTime.parse("2026-05-29T09:01:00"),
                60000L,
                List.of(new NodeSummary(
                        "node-summary",
                        "SUCCESS",
                        "NODE_COMPLETED",
                        Instant.parse("2026-05-29T01:00:00Z"),
                        Instant.parse("2026-05-29T01:01:00Z"),
                        Map.of("nodeType", "SUMMARY")
                ))
        );
    }

    private static LogFrame logFrame() {
        return new LogFrame(
                "event-1",
                "event-1",
                "warn",
                "Runtime retrying node node-summary.",
                "99",
                "trace-1",
                "99",
                "node-summary",
                "NODE_RETRYING",
                "RETRYING",
                Instant.parse("2026-05-29T01:00:30Z"),
                Map.of("attempt", 1)
        );
    }
}
