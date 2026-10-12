package com.aetherflow.workflow.subworkflow;

import org.junit.jupiter.api.Test;
import java.util.Map;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class SubworkflowConfigTest {
    @Test
    void mapsNestedValuesWithoutLeakingOtherVariables() {
        Map<String, Object> source = Map.of("request", Map.of("items", List.of(Map.of("text", "你好"))), "unrelated", "keep private");
        assertThat(SubworkflowService.mapValues(Map.of("text", "request.items[0].text"), source))
                .containsExactlyEntriesOf(Map.of("text", "你好"));
    }
    @Test
    void requiresImmutableIntegerVersionAndExplicitMappings() {
        assertThatThrownBy(() -> SubworkflowConfig.from(Map.of("definitionId", 1, "definitionVersion", "latest",
                "inputMappings", Map.of(), "outputMappings", Map.of()))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SubworkflowConfig.from(Map.of("definitionId", 1, "definitionVersion", 1.5,
                "inputMappings", Map.of(), "outputMappings", Map.of()))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SubworkflowConfig.from(Map.of("definitionId", 1, "definitionVersion", 1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(SubworkflowConfig.from(Map.of("definitionId", 1, "definitionVersion", 2,
                "inputMappings", Map.of(), "outputMappings", Map.of())).definitionVersion()).isEqualTo(2);
    }
    @Test
    void rejectsMissingMappingSourceBeforePublishing() {
        assertThatThrownBy(() -> SubworkflowService.mapValues(Map.of("text", "missing.text"), Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
