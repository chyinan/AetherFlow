package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
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
    private final ProviderRuntimeCatalogClient runtimeCatalogClient;

    public ProviderCatalogResponse catalog(ProviderRoutingPolicy routingPolicy) {
        ProviderRoutingPolicy policy = routingPolicy == null ? new ProviderRoutingPolicy() : routingPolicy.normalized();
        ProviderRuntimeCatalog runtimeCatalog = runtimeCatalogClient.catalog();
        List<AiProviderType> providerTypes = orderedProviders(policy, runtimeCatalog);
        List<ProviderCatalogResponse.ProviderCatalogProvider> providers = providerTypes.stream()
                .map(provider -> providerCard(provider, runtimeCatalog))
                .toList();
        List<ProviderCatalogResponse.ProviderCatalogModel> models = providerTypes.stream()
                .flatMap(provider -> providerModels(provider, runtimeCatalog).stream())
                .toList();
        return new ProviderCatalogResponse(providers, models);
    }

    private List<AiProviderType> orderedProviders(ProviderRoutingPolicy policy, ProviderRuntimeCatalog runtimeCatalog) {
        LinkedHashSet<AiProviderType> providers = new LinkedHashSet<>(policy.getProviders());
        if (properties.getDefaultProvider() != null) {
            providers.add(properties.getDefaultProvider());
        }
        if (providers.isEmpty()) {
            providers.add(AiProviderType.OPENAI);
            providers.add(AiProviderType.OLLAMA);
        }
        if (!runtimeCatalog.providers().isEmpty()) {
            LinkedHashSet<AiProviderType> runtimeProviders = new LinkedHashSet<>(runtimeCatalog.providers());
            providers.removeIf(provider -> !runtimeProviders.contains(provider));
            for (AiProviderType provider : runtimeProviders) {
                providers.add(provider);
            }
        }
        return new ArrayList<>(providers);
    }

    private ProviderCatalogResponse.ProviderCatalogProvider providerCard(AiProviderType provider,
                                                                         ProviderRuntimeCatalog runtimeCatalog) {
        return switch (provider) {
            case OPENAI -> new ProviderCatalogResponse.ProviderCatalogProvider(
                    providerId(provider),
                    provider,
                    "OpenAI Gateway",
                    "cloud llm",
                    "OpenAI API",
                    "provider-managed://openai",
                    catalogDefaultModel(provider, runtimeCatalog),
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
                    catalogDefaultModel(provider, runtimeCatalog),
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
                    catalogDefaultModel(provider, runtimeCatalog),
                    List.of("chat", "private runtime", "contract pending"),
                    Map.of("pricingConfigured", true, "managedBy", "python-ai-service")
            );
        };
    }

    private List<ProviderCatalogResponse.ProviderCatalogModel> providerModels(AiProviderType provider,
                                                                               ProviderRuntimeCatalog runtimeCatalog) {
        return switch (provider) {
            case OPENAI -> openAiModels(provider, runtimeCatalog);
            case OLLAMA -> ollamaModels(provider, runtimeCatalog);
            case LOCAL_MODEL -> List.of(model(
                    provider,
                    defaultModel(provider, runtimeCatalog),
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

    private List<ProviderCatalogResponse.ProviderCatalogModel> openAiModels(AiProviderType provider,
                                                                            ProviderRuntimeCatalog runtimeCatalog) {
        String defaultModel = defaultModel(provider, runtimeCatalog);
        List<String> runtimeModels = runtimeModelNames(provider, runtimeCatalog).stream()
                .sorted(Comparator.comparingInt(model -> model.equals(defaultModel) ? 0 : 1))
                .toList();
        if (!runtimeModels.isEmpty()) {
            return runtimeModels.stream()
                    .map(name -> runtimeOpenAiModel(provider, name, name.equals(defaultModel)))
                    .toList();
        }
        List<ProviderCatalogResponse.ProviderCatalogModel> models = new ArrayList<>();
        addIfAbsent(models, model(
                provider,
                defaultModel,
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

    private List<ProviderCatalogResponse.ProviderCatalogModel> ollamaModels(AiProviderType provider,
                                                                            ProviderRuntimeCatalog runtimeCatalog) {
        String defaultModel = defaultModel(provider, runtimeCatalog);
        List<String> runtimeModels = runtimeModelNames(provider, runtimeCatalog).stream()
                .sorted(Comparator.comparingInt(model -> runtimeModelRank(model, defaultModel)))
                .toList();
        if (!runtimeModels.isEmpty()) {
            return runtimeModels.stream()
                    .map(name -> runtimeOllamaModel(provider, name, name.equals(defaultModel)))
                    .toList();
        }
        return List.of();
    }

    private ProviderCatalogResponse.ProviderCatalogModel runtimeOllamaModel(AiProviderType provider,
                                                                             String name,
                                                                             boolean isDefault) {
        String kind = ollamaModelKind(name);
        List<String> capabilities = switch (kind) {
            case "embedding" -> List.of("embedding");
            case "asr" -> List.of("asr", "subtitle");
            default -> name.toLowerCase(Locale.ROOT).contains("coder")
                    ? List.of("chat", "summary", "translate", "code")
                    : List.of("chat", "summary", "translate");
        };
        List<String> tags = new ArrayList<>();
        if (isDefault) {
            tags.add("default");
        }
        tags.add("local");
        tags.add("private");
        tags.add(kind);
        return model(
                provider,
                name,
                kind,
                "installed",
                null,
                LOCAL_PRICING,
                capabilities,
                tags,
                "ready"
        );
    }

    private ProviderCatalogResponse.ProviderCatalogModel runtimeOpenAiModel(AiProviderType provider,
                                                                            String name,
                                                                            boolean isDefault) {
        List<String> tags = new ArrayList<>();
        if (isDefault) {
            tags.add("default");
        }
        tags.add("runtime");
        tags.add("openai-compatible");
        return model(
                provider,
                name,
                "chat",
                "runtime configured",
                null,
                EXTERNAL_PRICING,
                List.of("chat", "summary", "translate", "json"),
                tags,
                "ready"
        );
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

    private String defaultModel(AiProviderType provider, ProviderRuntimeCatalog runtimeCatalog) {
        List<String> runtimeModels = runtimeModelNames(provider, runtimeCatalog);
        if (!runtimeModels.isEmpty()) {
            String configured = properties.getDefaultModel() == null ? "" : properties.getDefaultModel().trim();
            if (runtimeModels.contains(configured)) {
                return configured;
            }
            return runtimeModels.stream()
                    .filter(model -> !"embedding".equals(ollamaModelKind(model)))
                    .findFirst()
                    .orElse(runtimeModels.get(0));
        }
        if (provider == properties.getDefaultProvider() && hasText(properties.getDefaultModel())) {
            return properties.getDefaultModel().trim();
        }
        return switch (provider) {
            case OPENAI -> "gpt-4o-mini";
            case OLLAMA -> hasText(properties.getDefaultModel()) ? properties.getDefaultModel().trim() : "llama3";
            case LOCAL_MODEL -> "local-runtime-default";
        };
    }

    private String catalogDefaultModel(AiProviderType provider, ProviderRuntimeCatalog runtimeCatalog) {
        if ((provider == AiProviderType.OLLAMA || provider == AiProviderType.LOCAL_MODEL)
                && runtimeModelNames(provider, runtimeCatalog).isEmpty()) {
            return "";
        }
        return defaultModel(provider, runtimeCatalog);
    }

    private List<String> runtimeModelNames(AiProviderType provider, ProviderRuntimeCatalog runtimeCatalog) {
        return runtimeCatalog.models().stream()
                .filter(model -> model.provider() == provider)
                .map(ProviderRuntimeCatalog.RuntimeModel::name)
                .filter(this::hasText)
                .distinct()
                .toList();
    }

    private String ollamaModelKind(String name) {
        String normalized = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (normalized.contains("embed")) {
            return "embedding";
        }
        if (normalized.contains("whisper") || normalized.contains("asr")) {
            return "asr";
        }
        return "chat";
    }

    private int runtimeModelRank(String model, String defaultModel) {
        if (model.equals(defaultModel)) {
            return 0;
        }
        return "embedding".equals(ollamaModelKind(model)) ? 2 : 1;
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
