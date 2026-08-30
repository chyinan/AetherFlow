package com.aetherflow.ai.image;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.ai.config.ImageProviderProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@Slf4j
// pattern: Imperative Shell
public class ImageProviderRegistry {

    private final Map<ImageProviderType, ImageGenerationProvider> providers;
    private final long healthCacheTtlNanos;
    private volatile List<String> cachedAvailableProviders;
    private volatile long cachedAtNanos;

    public ImageProviderRegistry(List<ImageGenerationProvider> providers) {
        this(providers, new ImageProviderProperties());
    }

    @Autowired
    public ImageProviderRegistry(List<ImageGenerationProvider> providers, ImageProviderProperties properties) {
        EnumMap<ImageProviderType, ImageGenerationProvider> mappedProviders = new EnumMap<>(ImageProviderType.class);
        if (providers != null) {
            for (ImageGenerationProvider provider : providers) {
                if (provider != null && provider.type() != null) {
                    mappedProviders.put(provider.type(), provider);
                }
            }
        }
        this.providers = Map.copyOf(mappedProviders);
        this.healthCacheTtlNanos = positiveNanos(properties.getHealthCacheTtl());
    }

    public ImageGenerationProvider getRequired(String provider) {
        ImageProviderType type = resolveType(provider);
        ImageGenerationProvider imageProvider = providers.get(type);
        if (imageProvider == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported image provider: " + provider);
        }
        return imageProvider;
    }

    public List<String> availableProviderNames() {
        long now = System.nanoTime();
        List<String> cached = cachedAvailableProviders;
        if (cached != null && now - cachedAtNanos < healthCacheTtlNanos) {
            return cached;
        }
        synchronized (this) {
            cached = cachedAvailableProviders;
            now = System.nanoTime();
            if (cached != null && now - cachedAtNanos < healthCacheTtlNanos) {
                return cached;
            }
            List<String> available = providers.entrySet().stream()
                    .filter(entry -> isAvailable(entry.getKey(), entry.getValue()))
                    .map(entry -> entry.getKey().name())
                    .sorted()
                    .toList();
            cachedAvailableProviders = available;
            cachedAtNanos = now;
            return available;
        }
    }

    private boolean isAvailable(ImageProviderType type, ImageGenerationProvider provider) {
        try {
            return provider.isAvailable();
        } catch (RuntimeException exception) {
            log.warn("image provider health probe failed, provider={}, reason={}",
                    type, exception.getClass().getSimpleName());
            return false;
        }
    }

    private long positiveNanos(java.time.Duration duration) {
        if (duration == null || duration.isZero() || duration.isNegative()) {
            return java.time.Duration.ofSeconds(10).toNanos();
        }
        return duration.toNanos();
    }

    private ImageProviderType resolveType(String provider) {
        if (provider == null || provider.isBlank()) {
            return ImageProviderType.COMFYUI;
        }
        String normalized = provider.trim().toUpperCase(Locale.ROOT);
        if ("SD_WEBUI".equals(normalized) || "STABLE_DIFFUSION".equals(normalized)) {
            return ImageProviderType.STABLE_DIFFUSION_WEBUI;
        }
        try {
            return ImageProviderType.from(normalized, ImageProviderType.COMFYUI);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported image provider: " + provider);
        }
    }
}
