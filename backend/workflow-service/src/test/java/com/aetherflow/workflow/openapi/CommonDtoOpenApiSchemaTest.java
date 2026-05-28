package com.aetherflow.workflow.openapi;

import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CommonDtoOpenApiSchemaTest {

    @Test
    void workflowAiAndNotifyDtosExposeOpenApiSchemas() {
        List<Class<?>> dtoClasses = List.of(
                WorkflowDefinitionDTO.class,
                WorkflowNodeDTO.class,
                AiTranscriptionRequestDTO.class,
                AiTranscriptionResponseDTO.class,
                AiWorkflowNodeRequestDTO.class,
                AiWorkflowNodeResponseDTO.class,
                NotifyMessageDTO.class,
                FileMetadataDTO.class,
                CreateFileMetadataRequestDTO.class
        );

        for (Class<?> dtoClass : dtoClasses) {
            assertThat(dtoClass.getAnnotation(Schema.class))
                    .as(dtoClass.getSimpleName() + " class schema")
                    .isNotNull();
            for (Field field : dtoClass.getDeclaredFields()) {
                assertThat(field.getAnnotation(Schema.class))
                        .as(dtoClass.getSimpleName() + "." + field.getName() + " field schema")
                        .isNotNull();
            }
        }
    }
}
