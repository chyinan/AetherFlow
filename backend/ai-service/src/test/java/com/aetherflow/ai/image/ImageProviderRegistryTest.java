package com.aetherflow.ai.image;

import com.aetherflow.common.core.ResultCode;
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
    void returnsComfyuiProviderWhenProviderIsBlank() {
        ImageGenerationProvider comfyuiProvider = new StubProvider(ImageProviderType.COMFYUI);
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(comfyuiProvider));

        assertThat(registry.getRequired(null)).isSameAs(comfyuiProvider);
        assertThat(registry.getRequired("   ")).isSameAs(comfyuiProvider);
    }

    @Test
    void returnsStableDiffusionWebuiProviderByAlias() {
        ImageGenerationProvider stableDiffusionProvider = new StubProvider(ImageProviderType.STABLE_DIFFUSION_WEBUI);
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(stableDiffusionProvider));

        assertThat(registry.getRequired("sd_webui")).isSameAs(stableDiffusionProvider);
        assertThat(registry.getRequired("stable_diffusion")).isSameAs(stableDiffusionProvider);
    }

    @Test
    void rejectsUnsupportedProvider() {
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of());

        assertThatThrownBy(() -> registry.getRequired("missing"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported image provider");
    }

    @Test
    void rejectsUnsupportedProviderWithoutFallingBack() {
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(new StubProvider(ImageProviderType.COMFYUI)));

        assertThatThrownBy(() -> registry.getRequired("missing"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining("unsupported image provider");
    }

    private record StubProvider(ImageProviderType type) implements ImageGenerationProvider {
        @Override
        public ImageGenerationResponse generate(ImageGenerationRequest request) {
            return new ImageGenerationResponse(type.name(), "txt2img", List.of(), null);
        }
    }
}
