package com.aetherflow.workflow.ocr.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.ocr.metrics.OCRMetrics;
import com.aetherflow.workflow.ocr.metrics.OCRMetricsSnapshot;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OCRMetricsControllerTest {

    @Test
    void exposesOcrMetrics() {
        OCRMetrics metrics = new OCRMetrics();
        metrics.recordSuccess(120);
        metrics.recordFailure(30);
        OCRMetricsController controller = new OCRMetricsController(metrics);

        Result<OCRMetricsSnapshot> result = controller.metrics();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().ocrCount()).isEqualTo(2);
        assertThat(result.getData().failCount()).isEqualTo(1);
        assertThat(result.getData().averageDurationMs()).isEqualTo(75);
    }
}
