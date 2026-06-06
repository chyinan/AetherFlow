package com.aetherflow.ai.image;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageProviderRegistryTest {

    @Test
    void returnsProviderByType() {
        ImageGenerationProvider comfyuiProvider = new StubProvider(ImageProviderType.COMFYUI);
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(comfyuiProvider));

        assertThat(registry.getRequired("comfyui")).isSameAs(comfyuiProvider);
    }

    @Test
    void rejectsUnsupportedProvider() {
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of());

        assertThatThrownBy(() -> registry.getRequired("missing"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported image provider");
    }

    private record StubProvider(ImageProviderType type) implements ImageGenerationProvider {
        @Override
        public ImageGenerationResponse generate(ImageGenerationRequest request) {
            return new ImageGenerationResponse(type, "txt2img", List.of(), null);
        }
    }
}
