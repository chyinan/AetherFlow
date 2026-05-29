package com.aetherflow.file.openapi;

import com.aetherflow.file.controller.FileController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class FileOpenApiContractTest {

    @Test
    void fileControllerDocumentsListApi() throws NoSuchMethodException {
        Tag tag = FileController.class.getAnnotation(Tag.class);
        assertThat(tag).isNotNull();
        assertThat(tag.name()).isNotBlank();
        assertThat(tag.description()).isNotBlank();

        assertOperationDocumented(FileController.class, "listFiles",
                Long.class, String.class, String.class, String.class, String.class, String.class, int.class, int.class);
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
