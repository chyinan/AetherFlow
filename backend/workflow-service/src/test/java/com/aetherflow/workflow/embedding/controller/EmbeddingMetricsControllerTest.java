package com.aetherflow.workflow.embedding.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetrics;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetricsSnapshot;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EmbeddingMetricsControllerTest {

    @Test
    void exposesWorkflowEmbeddingMetrics() {
        EmbeddingMetrics metrics = new EmbeddingMetrics();
        metrics.recordSuccess(100L, 3, "nomic-embed-text");
        metrics.recordFailure(50L, "nomic-embed-text");
        EmbeddingMetricsController controller = new EmbeddingMetricsController(metrics);

        Result<EmbeddingMetricsSnapshot> result = controller.metrics();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().embeddingCount()).isEqualTo(2);
        assertThat(result.getData().failCount()).isEqualTo(1);
        assertThat(result.getData().averageDurationMs()).isEqualTo(75);
        assertThat(result.getData().vectorCount()).isEqualTo(3);
        assertThat(result.getData().currentModel()).isEqualTo("nomic-embed-text");
    }
}
