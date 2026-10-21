package com.aetherflow.common.util;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 执行图解析必须区分"未编辑"与"明确清空"：
 * 缺省时按既有契约回落原图，明确清空时显式报错，不能偷偷执行原图。
 */
class ComfyUiExecutionGraphResolutionTest {

    private static final Map<String, Object> ORIGINAL_GRAPH = Map.of(
            "1", Map.of("class_type", "KSampler", "inputs", Map.of("seed", 1)));

    @Test
    void missingExecutionGraphFallsBackToTheOriginalGraph() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("workflow", ORIGINAL_GRAPH);

        assertThat(ComfyUiWorkflow.executionGraph(config)).isEqualTo(ORIGINAL_GRAPH);
    }

    @Test
    void explicitlyClearedExecutionGraphFailsInsteadOfRunningTheOriginalGraph() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("workflow", ORIGINAL_GRAPH);
        config.put("workflowJson", "");

        assertThatThrownBy(() -> ComfyUiWorkflow.executionGraph(config))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ComfyUI");
    }
}
