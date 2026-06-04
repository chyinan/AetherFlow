package com.aetherflow.notify.openapi;

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.controller.NotifyController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NotifyOpenApiContractTest {

    @Test
    void notifyControllerDocumentsPublicSseAndInternalSendApis() throws NoSuchMethodException {
        Tag tag = NotifyController.class.getAnnotation(Tag.class);
        assertThat(tag).as("NotifyController @Tag").isNotNull();
        assertThat(tag.description()).containsIgnoringCase("Internal");

        assertOperationDocumented("subscribe", Long.class, String.class);
        assertOperationDocumented("streamToken", Long.class, String.class);
        assertOperationDocumented("send", NotifyMessageDTO.class);
    }

    private static void assertOperationDocumented(String methodName, Class<?>... parameterTypes) throws NoSuchMethodException {
        var method = NotifyController.class.getDeclaredMethod(methodName, parameterTypes);
        Operation operation = method.getAnnotation(Operation.class);
        assertThat(operation).as(methodName + " @Operation").isNotNull();
        assertThat(operation.summary()).as(methodName + " summary").isNotBlank();
        assertThat(method.getAnnotationsByType(ApiResponse.class))
                .as(methodName + " @ApiResponse")
                .isNotEmpty();
    }
}
