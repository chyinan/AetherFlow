package com.aetherflow.workflow.importer;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.validation.WorkflowNodeConfigValidator;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.service.impl.WorkflowServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ComfyImportSaveRecoveryTest {
    @Test void unresolvedUiAndApiSummariesPassActualSaveDagValidationWithoutFakeText() {
        var registry=mock(NodeRegistry.class);
        when(registry.get(any())).thenReturn(Optional.of(mock(NodeExecutor.class)));
        var catalog=new WorkflowNodeCatalogService();
        var service=new WorkflowServiceImpl(null,null,null,null,new ObjectMapper(),new WorkflowRuntimeProperties(),registry,catalog,null,Runnable::run,null);
        List<Map<String,Object>> graphs=List.of(Map.of("nodes",List.of(Map.of("id",1,"type","PluginCustom")),"links",List.of()),
                Map.of("1",Map.of("class_type","PluginCustom","inputs",Map.of())));
        try {
            for(var graph:graphs) {
                var definition=new ComfyUiWorkflowImportService().importWorkflow("synthetic",null,null,graph);
                assertThat(definition.getNodes().get(1).getConfig()).containsEntry("prompt","");
                assertThat(WorkflowNodeConfigValidator.validateAll(definition.getNodes(),catalog)).isEmpty();
                assertThatCode(()->ReflectionTestUtils.invokeMethod(service,"validateSingleDag",definition)).doesNotThrowAnyException();
                assertThat(definition.getNodes().get(2).getConfig()).containsEntry("workflow",graph).containsEntry("workflowJson",graph);
            }
            var ordinary=new WorkflowNodeDTO();ordinary.setNodeId("ordinary");ordinary.setNodeType("PROMPT");ordinary.setConfig(Map.of("prompt","","stylePreset","ordinary"));
            assertThat(WorkflowNodeConfigValidator.validate(ordinary,catalog.catalog())).anyMatch(message->message.contains("'prompt' is required"));
        } finally { ReflectionTestUtils.invokeMethod(service,"shutdownStartLeaseHeartbeat"); }
    }
}
