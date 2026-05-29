package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ProviderCatalogService {

    private static final String SOURCE = "backend-static-metadata";
    private static final ProviderCatalogResponse.ProviderCatalogPricing EXTERNAL_PRICING =
            new ProviderCatalogResponse.ProviderCatalogPricing(
                    "tokens",
                    null,
                    null,
                    "external pricing not configured",
                    SOURCE
            );
    private static final ProviderCatalogResponse.ProviderCatalogPricing LOCAL_PRICING =
            new ProviderCatalogResponse.ProviderCatalogPricing(
                    "tokens",
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    "local runtime",
                    SOURCE
            );

    private final AiTaskProperties properties;

    public ProviderCatalogResponse catalog(ProviderRoutingPolicy routingPolicy) {
        ProviderRoutingPolicy policy = routingPolicy == null ? new ProviderRoutingPolicy() : routingPolicy.normalized();
        List<AiProviderType> providerTypes = orderedProviders(policy);
        List<ProviderCatalogResponse.ProviderCatalogProvider> providers = providerTypes.stream()
                .map(this::providerCard)
                .toList();
        List<ProviderCatalogResponse.ProviderCatalogModel> models = providerTypes.stream()
                .flatMap(provider -> providerModels(provider).stream())
                .toList();
        return new ProviderCatalogResponse(providers, models);
    }

    private List<AiProviderType> orderedProviders(ProviderRoutingPolicy policy) {
        LinkedHashSet<AiProviderType> providers = new LinkedHashSet<>(policy.getProviders());
        if (properties.getDefaultProvider() != null) {
            providers.add(properties.getDefaultProvider());
        }
        if (providers.isEmpty()) {
            providers.add(AiProviderType.OPENAI);
            providers.add(AiProviderType.OLLAMA);
        }
        return new ArrayList<>(providers);
    }

    private ProviderCatalogResponse.ProviderCatalogProvider providerCard(AiProviderType provider) {
        return switch (provider) {
            case OPENAI -> new ProviderCatalogResponse.ProviderCatalogProvider(
                    providerId(provider),
                    provider,
                    "OpenAI Gateway",
                    "cloud llm",
                    "OpenAI API",
                    "provider-managed://openai",
                    defaultModel(provider),
                    List.of("chat", "summary", "translate", "json", "governed failover"),
                    Map.of("pricingConfigured", false, "managedBy", "python-ai-service")
            );
            case OLLAMA -> new ProviderCatalogResponse.ProviderCatalogProvider(
                    providerId(provider),
                    provider,
                    "Ollama Local",
                    "local llm",
                    "Ollama Local Runtime",
                    "provider-managed://ollama",
                    defaultModel(provider),
                    List.of("chat", "summary", "translate", "local fallback", "offline capable"),
                    Map.of("pricingConfigured", true, "managedBy", "python-ai-service")
            );
            case LOCAL_MODEL -> new ProviderCatalogResponse.ProviderCatalogProvider(
                    providerId(provider),
                    provider,
                    "Local Model Runtime",
                    "local runtime",
                    "Local Model Runtime",
                    "provider-managed://local-model",
                    defaultModel(provider),
                    List.of("chat", "private runtime", "contract pending"),
                    Map.of("pricingConfigured", true, "managedBy", "python-ai-service")
            );
        };
    }

    private List<ProviderCatalogResponse.ProviderCatalogModel> providerModels(AiProviderType provider) {
        return switch (provider) {
            case OPENAI -> openAiModels(provider);
            case OLLAMA -> ollamaModels(provider);
            case LOCAL_MODEL -> List.of(model(
                    provider,
                    defaultModel(provider),
                    "chat",
                    "runtime configured",
                    null,
                    LOCAL_PRICING,
                    List.of("chat", "private runtime"),
                    List.of("local", "contract pending"),
                    "warming"
            ));
        };
    }

    private List<ProviderCatalogResponse.ProviderCatalogModel> openAiModels(AiProviderType provider) {
        List<ProviderCatalogResponse.ProviderCatalogModel> models = new ArrayList<>();
        addIfAbsent(models, model(
                provider,
                defaultModel(provider),
                "chat",
                "128k",
                128000,
                EXTERNAL_PRICING,
                List.of("chat", "summary", "translate", "json"),
                List.of("default", "cloud", "pricing external"),
                "ready"
        ));
        addIfAbsent(models, model(
                provider,
                "gpt-4o-mini",
                "chat",
                "128k",
                128000,
                EXTERNAL_PRICING,
                List.of("chat", "summary", "translate", "json"),
                List.of("fast", "cloud", "pricing external"),
                "ready"
        ));
        return models;
    }

    private List<ProviderCatalogResponse.ProviderCatalogModel> ollamaModels(AiProviderType provider) {
        List<ProviderCatalogResponse.ProviderCatalogModel> models = new ArrayList<>();
        addIfAbsent(models, model(
                provider,
                defaultModel(provider),
                "chat",
                "8k",
                8192,
                LOCAL_PRICING,
                List.of("chat", "summary", "translate"),
                List.of("default", "local", "private"),
                "ready"
        ));
        addIfAbsent(models, model(
                provider,
                "qwen2.5:7b",
                "chat",
                "32k",
                32768,
                LOCAL_PRICING,
                List.of("chat", "summary", "translate"),
                List.of("fallback", "local", "private"),
                "ready"
        ));
        return models;
    }

    private ProviderCatalogResponse.ProviderCatalogModel model(AiProviderType provider,
                                                               String name,
                                                               String kind,
                                                               String contextWindow,
                                                               Integer contextWindowTokens,
                                                               ProviderCatalogResponse.ProviderCatalogPricing pricing,
                                                               List<String> capabilities,
                                                               List<String> tags,
                                                               String status) {
        return new ProviderCatalogResponse.ProviderCatalogModel(
                modelId(provider, name),
                providerId(provider),
                provider,
                name,
                kind,
                contextWindow,
                contextWindowTokens,
                pricing,
                List.copyOf(capabilities),
                List.copyOf(tags),
                status
        );
    }

    private void addIfAbsent(List<ProviderCatalogResponse.ProviderCatalogModel> models,
                             ProviderCatalogResponse.ProviderCatalogModel candidate) {
        boolean exists = models.stream().anyMatch(model -> model.name().equals(candidate.name()));
        if (!exists) {
            models.add(candidate);
        }
    }

    private String defaultModel(AiProviderType provider) {
        if (provider == properties.getDefaultProvider() && hasText(properties.getDefaultModel())) {
            return properties.getDefaultModel().trim();
        }
        return switch (provider) {
            case OPENAI -> "gpt-4o-mini";
            case OLLAMA -> hasText(properties.getDefaultModel()) ? properties.getDefaultModel().trim() : "llama3";
            case LOCAL_MODEL -> "local-runtime-default";
        };
    }

    private String providerId(AiProviderType provider) {
        return "provider-" + provider.name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    private String modelId(AiProviderType provider, String model) {
        return "model-" + provider.name().toLowerCase(Locale.ROOT).replace('_', '-') + "-" + slug(model);
    }

    private String slug(String value) {
        String slug = value == null ? "runtime-default" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
        slug = slug.replaceAll("^-+", "").replaceAll("-+$", "");
        return slug.isBlank() ? "runtime-default" : slug;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
