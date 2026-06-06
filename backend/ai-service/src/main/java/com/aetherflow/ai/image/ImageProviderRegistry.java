package com.aetherflow.ai.image;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class ImageProviderRegistry {

    private final Map<ImageProviderType, ImageGenerationProvider> providers;

    public ImageProviderRegistry(List<ImageGenerationProvider> providers) {
        EnumMap<ImageProviderType, ImageGenerationProvider> mappedProviders = new EnumMap<>(ImageProviderType.class);
        if (providers != null) {
            for (ImageGenerationProvider provider : providers) {
                if (provider != null && provider.type() != null) {
                    mappedProviders.put(provider.type(), provider);
                }
            }
        }
        this.providers = Map.copyOf(mappedProviders);
    }

    public ImageGenerationProvider getRequired(String provider) {
        ImageProviderType type = resolveType(provider);
        ImageGenerationProvider imageProvider = providers.get(type);
        if (imageProvider == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported image provider: " + provider);
        }
        return imageProvider;
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
