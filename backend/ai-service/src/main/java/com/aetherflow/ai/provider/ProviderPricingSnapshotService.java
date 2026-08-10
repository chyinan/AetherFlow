package com.aetherflow.ai.provider;

// pattern: Functional Core

import com.aetherflow.ai.config.AiTaskProperties;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ProviderPricingSnapshotService {

    private static final BigDecimal ONE_MILLION = BigDecimal.valueOf(1_000_000L);
    private final List<Snapshot> snapshots;

    public ProviderPricingSnapshotService(AiTaskProperties properties) {
        this.snapshots = properties.getPricingSnapshots().stream().map(this::validatedSnapshot).toList();
    }

    public Optional<Snapshot> find(AiProviderType provider, String model, Instant occurredAt) {
        if (provider == null || model == null || model.isBlank() || occurredAt == null) {
            return Optional.empty();
        }
        return snapshots.stream()
                .filter(snapshot -> snapshot.provider() == provider)
                .filter(snapshot -> snapshot.model().equals(model))
                .filter(snapshot -> !snapshot.effectiveAt().isAfter(occurredAt))
                .max(java.util.Comparator.comparing(Snapshot::effectiveAt));
    }

    public Map<String, Object> addCostMetadata(Map<String, Object> metadata,
                                               AiProviderType provider,
                                               String model,
                                               Instant occurredAt) {
        Map<String, Object> result = metadata == null ? new LinkedHashMap<>() : new LinkedHashMap<>(metadata);
        Optional<Snapshot> snapshot = find(provider, model, occurredAt);
        Optional<Long> promptTokens = nonNegativeLong(result.get("promptTokens"));
        Optional<Long> completionTokens = nonNegativeLong(result.get("completionTokens"));
        if (snapshot.isEmpty() || promptTokens.isEmpty() || completionTokens.isEmpty()) {
            return Map.copyOf(result);
        }
        Snapshot price = snapshot.orElseThrow();
        BigDecimal inputCost = price.inputUsdPerMillionTokens()
                .multiply(BigDecimal.valueOf(promptTokens.orElseThrow()))
                .divide(ONE_MILLION, 12, RoundingMode.HALF_UP);
        BigDecimal outputCost = price.outputUsdPerMillionTokens()
                .multiply(BigDecimal.valueOf(completionTokens.orElseThrow()))
                .divide(ONE_MILLION, 12, RoundingMode.HALF_UP);
        result.put("estimatedCostUsd", inputCost.add(outputCost).stripTrailingZeros().toPlainString());
        result.put("pricingSource", price.source());
        result.put("pricingEffectiveAt", price.effectiveAt().toString());
        result.put("inputUsdPerMillionTokens", price.inputUsdPerMillionTokens());
        result.put("outputUsdPerMillionTokens", price.outputUsdPerMillionTokens());
        return Map.copyOf(result);
    }

    private Snapshot validatedSnapshot(AiTaskProperties.PricingSnapshot configured) {
        if (configured.getProvider() == null || configured.getModel() == null || configured.getModel().isBlank()) {
            throw new IllegalStateException("invalid AI pricing snapshot: provider and model are required");
        }
        if (configured.getInputUsdPerMillionTokens() == null || configured.getOutputUsdPerMillionTokens() == null
                || configured.getInputUsdPerMillionTokens().signum() < 0 || configured.getOutputUsdPerMillionTokens().signum() < 0) {
            throw new IllegalStateException("invalid AI pricing snapshot: non-negative input and output prices are required");
        }
        if (configured.getSource() == null || configured.getSource().isBlank() || configured.getEffectiveAt() == null) {
            throw new IllegalStateException("invalid AI pricing snapshot: source and effectiveAt are required");
        }
        return new Snapshot(configured.getProvider(), configured.getModel().trim(),
                configured.getInputUsdPerMillionTokens(), configured.getOutputUsdPerMillionTokens(),
                configured.getSource().trim(), configured.getEffectiveAt());
    }

    private Optional<Long> nonNegativeLong(Object value) {
        if (value instanceof Number number && number.longValue() >= 0) {
            return Optional.of(number.longValue());
        }
        return Optional.empty();
    }

    public record Snapshot(AiProviderType provider,
                           String model,
                           BigDecimal inputUsdPerMillionTokens,
                           BigDecimal outputUsdPerMillionTokens,
                           String source,
                           Instant effectiveAt) {
    }
}
