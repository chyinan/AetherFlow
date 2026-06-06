package com.aetherflow.ai.image;

import java.util.Locale;

public enum ImageProviderType {
    STABLE_DIFFUSION_WEBUI,
    COMFYUI;

    public static ImageProviderType from(String value, ImageProviderType fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return ImageProviderType.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
