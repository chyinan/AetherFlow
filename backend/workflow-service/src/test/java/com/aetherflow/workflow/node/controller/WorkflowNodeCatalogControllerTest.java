package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogItem;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.catalog.WorkflowNodeConfigSchema;
import com.aetherflow.workflow.node.catalog.WorkflowNodeVariableSchema;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowNodeCatalogControllerTest {

    @Test
    void exposesFrontendWorkflowNodeCatalog() {
        WorkflowNodeCatalogController controller = new WorkflowNodeCatalogController(new WorkflowNodeCatalogService());

        Result<List<WorkflowNodeCatalogItem>> result = controller.catalog();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData())
                .extracting(WorkflowNodeCatalogItem::type)
                .containsExactly(
                        "START",
                        "END",
                        "UPLOAD",
                        "WHISPER",
                        "SUMMARY",
                        "EXPORT",
                        "NOTIFY",
                        "CONDITION",
                        "MOCK"
                );

        WorkflowNodeCatalogItem upload = item(result.getData(), "UPLOAD");
        assertThat(upload.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("fileId", "fileIdVariable");
        assertThat(upload.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("fileUrl", "fileObjectKey", "fileSize");
        assertThat(upload.exampleConfig()).containsEntry("fileIdVariable", "fileId");

        WorkflowNodeCatalogItem condition = item(result.getData(), "CONDITION");
        assertThat(condition.configSchema())
                .filteredOn(schema -> "operator".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.options()).contains("EQUALS", "NOT_EQUALS", "EXISTS"));
        assertThat(condition.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("matched", "branchKey");
    }

    private static WorkflowNodeCatalogItem item(List<WorkflowNodeCatalogItem> items, String type) {
        return items.stream()
                .filter(item -> type.equals(item.type()))
                .findFirst()
                .orElseThrow();
    }
}
