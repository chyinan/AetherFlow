package com.aetherflow.workflow.controller;

import com.aetherflow.workflow.service.impl.WorkflowNodeRerunService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WorkflowNodeRerunControllerTest {
    @Test
    void exposesPreviewAndRejectsMissingRevision() throws Exception {
        WorkflowNodeRerunService service = mock(WorkflowNodeRerunService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new WorkflowNodeRerunController(service)).build();
        when(service.preview(1L, "failed")).thenReturn(new WorkflowNodeRerunService.Preview(1L, "failed", "revision", true,
                List.of(new WorkflowNodeRerunService.NodeRef("failed", "失败节点")), List.of(), List.of()));
        mvc.perform(get("/workflow-instances/1/nodes/failed/rerun/preview"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value("revision"))
                .andExpect(jsonPath("$.data.invalidatedNodes[0].nodeId").value("failed"));
        mvc.perform(post("/workflow-instances/1/nodes/failed/rerun").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verify(service, never()).rerun(any(), any(), any());
    }
}
