package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.ai.image.ComfyUiProvider;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.image.StableDiffusionWebUiProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@RequiredArgsConstructor
public class NodeConnectionProviderFactory {
    private final RestClient.Builder builder;
    private final ImageProviderProperties defaults;

    public ImageGenerationProvider create(NodeConnectionProfile profile) {
        // 为单个已保存连接构造执行客户端，不改变部署级 Provider 开关与旧路由。
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.setDefaultTimeout(defaults.getDefaultTimeout());
        properties.setHealthTimeout(defaults.getHealthTimeout());
        properties.getComfy().setPollInterval(defaults.getComfy().getPollInterval());
        properties.getComfy().setMaxWait(defaults.getComfy().getMaxWait());
        if (ImageProviderType.COMFYUI.name().equals(profile.provider())) {
            properties.getComfy().setBaseUrl(profile.baseUrl());
            return new ComfyUiProvider(builder.clone(), properties);
        }
        properties.getStableDiffusion().setBaseUrl(profile.baseUrl());
        return new StableDiffusionWebUiProvider(builder.clone(), properties);
    }
}
