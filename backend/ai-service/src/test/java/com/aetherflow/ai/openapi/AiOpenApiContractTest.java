package com.aetherflow.ai.openapi;

import com.aetherflow.ai.controller.AiController;
import com.aetherflow.ai.controller.AiProviderController;
import com.aetherflow.ai.controller.AiWorkflowNodeController;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderRoutingPolicy;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class AiOpenApiContractTest {

    @Test
    void aiControllersExposePublicAndInternalOperationDocumentation() throws NoSuchMethodException {
        assertControllerDocumented(AiController.class, false);
        assertOperationDocumented(AiController.class, "transcribe", AiTranscriptionRequestDTO.class);
        assertOperationDocumented(AiController.class, "status");

        assertControllerDocumented(AiProviderController.class, false);
        assertOperationDocumented(AiProviderController.class, "status");
        assertOperationDocumented(AiProviderController.class, "policy");
        assertOperationDocumented(AiProviderController.class, "updatePolicy", ProviderRoutingPolicy.class);
        assertOperationDocumented(AiProviderController.class, "recover", AiProviderType.class);
        assertOperationDocumented(AiProviderController.class, "metrics");
        assertOperationDocumented(AiProviderController.class, "catalog");
        assertOperationDocumented(AiProviderController.class, "logs", int.class);

        assertControllerDocumented(AiWorkflowNodeController.class, true);
        assertOperationDocumented(AiWorkflowNodeController.class, "execute", AiWorkflowNodeRequestDTO.class);
    }

    private static void assertControllerDocumented(Class<?> controllerType, boolean internal) {
        Tag tag = controllerType.getAnnotation(Tag.class);
        assertThat(tag).as(controllerType.getSimpleName() + " @Tag").isNotNull();
        assertThat(tag.name()).as(controllerType.getSimpleName() + " tag name").isNotBlank();
        assertThat(tag.description()).as(controllerType.getSimpleName() + " tag description").isNotBlank();
        if (internal) {
            assertThat(tag.name() + " " + tag.description()).containsIgnoringCase("Internal");
        }
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
