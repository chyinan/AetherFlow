package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigRequest;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigResponse;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreTestResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.InetAddress;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

@Service
@RequiredArgsConstructor
public class VectorStoreConfigService {

    private static final long DEFAULT_CONFIG_ID = 1L;

    private final EmbeddingProperties properties;
    private final VectorStoreConfigMapper mapper;
    private final AtomicReference<VectorStoreRuntimeConfig> runtimeConfig = new AtomicReference<>();

    public VectorStoreConfigResponse current() {
        VectorStoreRuntimeConfig config = currentConfig();
        return response(config, config.enabled() ? "configured" : "disabled");
    }

    public VectorStoreConfigResponse update(VectorStoreConfigRequest request) {
        VectorStoreRuntimeConfig config = toConfig(request, currentConfig());
        VectorStoreConfigEntity existing = mapper.selectById(DEFAULT_CONFIG_ID);
        VectorStoreConfigEntity entity = toEntity(config, existing);
        if (existing == null) {
            mapper.insert(entity);
        } else {
            mapper.updateById(entity);
        }
        runtimeConfig.set(config);
        return response(config, config.enabled() ? "configured" : "disabled");
    }

    public VectorStoreTestResponse test(VectorStoreConfigRequest request) {
        VectorStoreRuntimeConfig config = toConfig(request, currentConfig());
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + "/collections"))
                    .timeout(properties.getTimeout())
                    .GET();
            if (!config.apiKey().isBlank()) {
                builder.header("api-key", config.apiKey());
            }
            HttpResponse<String> response = HttpClient.newBuilder()
                    .connectTimeout(properties.getTimeout())
                    .build()
                    .send(builder.build(), HttpResponse.BodyHandlers.ofString());
            boolean success = response.statusCode() >= 200 && response.statusCode() < 300;
            if (!success) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "vector store connection test failed");
            }
            return new VectorStoreTestResponse(true, "vector store connection is healthy", config.provider(), config.baseUrl(), config.collection());
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "vector store connection test failed");
        }
    }

    public VectorStoreRuntimeConfig currentConfig() {
        VectorStoreRuntimeConfig configured = runtimeConfig.get();
        if (configured != null) {
            return configured;
        }
        VectorStoreConfigEntity persisted = mapper.selectById(DEFAULT_CONFIG_ID);
        if (persisted != null) {
            VectorStoreRuntimeConfig restored = fromEntity(persisted);
            runtimeConfig.compareAndSet(null, restored);
            return runtimeConfig.get();
        }
        return new VectorStoreRuntimeConfig(
                "qdrant",
                false,
                normalizeBaseUrl(properties.getQdrantBaseUrl()),
                properties.getQdrantApiKey() == null ? "" : properties.getQdrantApiKey(),
                properties.getDefaultVectorCollection()
        );
    }

    private VectorStoreRuntimeConfig toConfig(VectorStoreConfigRequest request,
                                              VectorStoreRuntimeConfig existing) {
        if (request == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "vector store config is required");
        }
        String provider = text(request.getProvider(), "qdrant").toLowerCase(Locale.ROOT);
        if (!"qdrant".equals(provider)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "only qdrant vector store is supported");
        }
        String baseUrl = normalizeBaseUrl(request.getBaseUrl());
        String collection = text(request.getCollection(), properties.getDefaultVectorCollection());
        if (!collection.matches("[A-Za-z0-9._-]{1,255}")) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "vector store collection is invalid");
        }
        return new VectorStoreRuntimeConfig(
                provider,
                request.isEnabled(),
                baseUrl,
                request.getApiKey() == null ? existing.apiKey() : request.getApiKey().trim(),
                collection
        );
    }

    private VectorStoreRuntimeConfig fromEntity(VectorStoreConfigEntity entity) {
        String provider = text(entity.getProvider(), "qdrant").toLowerCase(Locale.ROOT);
        if (!"qdrant".equals(provider)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "only qdrant vector store is supported");
        }
        return new VectorStoreRuntimeConfig(
                provider,
                Boolean.TRUE.equals(entity.getEnabled()),
                normalizeBaseUrl(text(entity.getBaseUrl(), properties.getQdrantBaseUrl())),
                text(entity.getApiKey(), ""),
                text(entity.getCollection(), properties.getDefaultVectorCollection())
        );
    }

    private VectorStoreConfigEntity toEntity(VectorStoreRuntimeConfig config,
                                             VectorStoreConfigEntity existing) {
        LocalDateTime now = LocalDateTime.now();
        VectorStoreConfigEntity entity = new VectorStoreConfigEntity();
        entity.setId(DEFAULT_CONFIG_ID);
        entity.setProvider(config.provider());
        entity.setEnabled(config.enabled());
        entity.setBaseUrl(config.baseUrl());
        entity.setApiKey(config.apiKey());
        entity.setCollection(config.collection());
        entity.setCreatedAt(existing == null || existing.getCreatedAt() == null ? now : existing.getCreatedAt());
        entity.setUpdatedAt(now);
        return entity;
    }

    private VectorStoreConfigResponse response(VectorStoreRuntimeConfig config, String status) {
        return new VectorStoreConfigResponse(
                config.provider(),
                config.enabled(),
                status,
                config.baseUrl(),
                config.collection(),
                !config.apiKey().isBlank()
        );
    }

    private String normalizeBaseUrl(String rawValue) {
        String value = text(rawValue, "");
        if (value.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "vector store baseUrl is required");
        }
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "vector store baseUrl must be http or https");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "vector store baseUrl host is required");
            }
            validateHost(uri.getHost());
            return value.replaceAll("/+$", "");
        } catch (URISyntaxException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "vector store baseUrl is invalid");
        }
    }

    private void validateHost(String rawHost) {
        String host = rawHost.trim();
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        if (host.equalsIgnoreCase("localhost") || host.endsWith(".localhost")) {
            rejectPrivateNetwork();
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (isPrivateAddress(address)) {
                    rejectPrivateNetwork();
                }
            }
        } catch (java.net.UnknownHostException ignored) {
            // A public hostname can be temporarily unresolvable while saving configuration.
        }
    }

    private boolean isPrivateAddress(InetAddress address) {
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress();
    }

    private void rejectPrivateNetwork() {
        throw new BusinessException(ResultCode.BAD_REQUEST, "vector store private network targets are not allowed");
    }

    private String text(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback == null ? "" : fallback;
        }
        return value.trim();
    }

    public record VectorStoreRuntimeConfig(
            String provider,
            boolean enabled,
            String baseUrl,
            String apiKey,
            String collection
    ) {
    }
}
