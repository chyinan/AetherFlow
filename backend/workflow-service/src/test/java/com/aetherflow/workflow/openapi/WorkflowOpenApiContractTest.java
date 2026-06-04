package com.aetherflow.workflow.openapi;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.controller.WorkflowController;
import com.aetherflow.workflow.controller.WorkflowInstanceController;
import com.aetherflow.workflow.embedding.controller.EmbeddingMetricsController;
import com.aetherflow.workflow.node.controller.WorkflowNodeCatalogController;
import com.aetherflow.workflow.node.controller.WorkflowNodeMetricsController;
import com.aetherflow.workflow.ocr.controller.OCRMetricsController;
import com.aetherflow.workflow.runtime.controller.WorkflowRuntimeController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowOpenApiContractTest {

    @Test
    void workflowControllersExposeOperationDocumentation() throws NoSuchMethodException {
        assertControllerDocumented(WorkflowController.class);
        assertOperationDocumented(WorkflowController.class, "createDefinition", WorkflowDefinitionDTO.class);
        assertOperationDocumented(WorkflowController.class, "listDefinitions");
        assertOperationDocumented(WorkflowController.class, "getDefinition", Long.class);
        assertOperationDocumented(WorkflowController.class, "updateDefinition", Long.class, WorkflowDefinitionDTO.class);
        assertOperationDocumented(WorkflowController.class, "deleteDefinition", Long.class);
        assertOperationDocumented(WorkflowController.class, "startInstance", Long.class, StartWorkflowRequest.class);

        assertControllerDocumented(WorkflowInstanceController.class);
        assertOperationDocumented(WorkflowInstanceController.class, "listInstances", String.class, String.class, int.class, int.class);
        assertOperationDocumented(WorkflowInstanceController.class, "getInstance", Long.class);
        assertOperationDocumented(WorkflowInstanceController.class, "logs", Long.class);

        assertControllerDocumented(WorkflowRuntimeController.class);
        assertOperationDocumented(WorkflowRuntimeController.class, "metrics");
        assertOperationDocumented(WorkflowRuntimeController.class, "observability", String.class, Long.class);
        assertOperationDocumented(WorkflowRuntimeController.class, "events", String.class, Long.class);
        assertOperationDocumented(WorkflowRuntimeController.class, "stream", String.class, Long.class, String.class, String.class);

        assertControllerDocumented(WorkflowNodeMetricsController.class);
        assertOperationDocumented(WorkflowNodeMetricsController.class, "metrics");

        assertControllerDocumented(WorkflowNodeCatalogController.class);
        assertOperationDocumented(WorkflowNodeCatalogController.class, "catalog");

        assertControllerDocumented(EmbeddingMetricsController.class);
        assertOperationDocumented(EmbeddingMetricsController.class, "metrics");

        assertControllerDocumented(OCRMetricsController.class);
        assertOperationDocumented(OCRMetricsController.class, "metrics");
    }

    private static void assertControllerDocumented(Class<?> controllerType) {
        Tag tag = controllerType.getAnnotation(Tag.class);
        assertThat(tag).as(controllerType.getSimpleName() + " @Tag").isNotNull();
        assertThat(tag.name()).as(controllerType.getSimpleName() + " tag name").isNotBlank();
        assertThat(tag.description()).as(controllerType.getSimpleName() + " tag description").isNotBlank();
    }

    private static void assertOperationDocumented(Class<?> controllerType,
                                                  String methodName,
                                                  Class<?>... parameterTypes) throws NoSuchMethodException {
        Method method = controllerType.getDeclaredMethod(methodName, parameterTypes);
        Operation operation = method.getAnnotation(Operation.class);
        assertThat(operation).as(controllerType.getSimpleName() + "." + methodName + " @Operation").isNotNull();
        assertThat(operation.summary()).as(controllerType.getSimpleName() + "." + methodName + " summary").isNotBlank();
        assertThat(method.getAnnotationsByType(ApiResponse.class))
                .as(controllerType.getSimpleName() + "." + methodName + " @ApiResponse")
                .isNotEmpty();
    }
}
