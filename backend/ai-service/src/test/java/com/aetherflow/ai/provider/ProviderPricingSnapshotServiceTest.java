package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProviderPricingSnapshotServiceTest {

    @Test
    void calculatesCostOnlyFromMatchingEffectiveSnapshotAndRealUsage() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setPricingSnapshots(List.of(snapshot("2026-01-01T00:00:00Z", "0.15", "0.60")));
        ProviderPricingSnapshotService service = new ProviderPricingSnapshotService(properties);

        Map<String, Object> metadata = service.addCostMetadata(
                Map.of("promptTokens", 1_000_000, "completionTokens", 500_000),
                AiProviderType.OPENAI,
                "gpt-4o-mini",
                Instant.parse("2026-07-23T00:00:00Z"));

        assertThat(metadata).containsEntry("estimatedCostUsd", "0.45");
        assertThat(metadata).containsEntry("pricingSource", "provider pricing page");
        assertThat(metadata).containsEntry("pricingEffectiveAt", "2026-01-01T00:00:00Z");
    }

    @Test
    void leavesCostUnknownWhenUsageOrApplicableSnapshotIsMissing() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setPricingSnapshots(List.of(snapshot("2027-01-01T00:00:00Z", "0.15", "0.60")));
        ProviderPricingSnapshotService service = new ProviderPricingSnapshotService(properties);

        Map<String, Object> metadata = service.addCostMetadata(
                Map.of("totalTokens", 20), AiProviderType.OPENAI, "gpt-4o-mini",
                Instant.parse("2026-07-23T00:00:00Z"));

        assertThat(metadata).doesNotContainKeys("estimatedCostUsd", "pricingSource");
    }

    @Test
    void rejectsIncompleteOrNegativePricingAtStartup() {
        AiTaskProperties properties = new AiTaskProperties();
        AiTaskProperties.PricingSnapshot invalid = snapshot("2026-01-01T00:00:00Z", "-1", "0.60");
        properties.setPricingSnapshots(List.of(invalid));

        assertThatThrownBy(() -> new ProviderPricingSnapshotService(properties))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non-negative");
    }

    private AiTaskProperties.PricingSnapshot snapshot(String effectiveAt, String input, String output) {
        AiTaskProperties.PricingSnapshot snapshot = new AiTaskProperties.PricingSnapshot();
        snapshot.setProvider(AiProviderType.OPENAI);
        snapshot.setModel("gpt-4o-mini");
        snapshot.setInputUsdPerMillionTokens(new BigDecimal(input));
        snapshot.setOutputUsdPerMillionTokens(new BigDecimal(output));
        snapshot.setSource("provider pricing page");
        snapshot.setEffectiveAt(Instant.parse(effectiveAt));
        return snapshot;
    }
}
