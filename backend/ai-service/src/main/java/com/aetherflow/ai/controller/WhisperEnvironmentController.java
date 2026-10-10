package com.aetherflow.ai.controller;

import com.aetherflow.common.core.Result;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

// pattern: Imperative Shell
/** 只读的单一 Python 环境快照，不加载模型或更改部署配置。 */
@RestController
@RequestMapping("/ai/node-connections/whisper")
public class WhisperEnvironmentController {
    private final RestClient statusClient;

    public WhisperEnvironmentController(@Qualifier("pythonAiStatusRestClient") RestClient statusClient) {
        this.statusClient = statusClient;
    }

    @GetMapping
    public Result<EnvironmentStatus> status() {
        try {
            EnvironmentStatus result = statusClient.get().uri("/ai/whisper/environment")
                    .retrieve().body(EnvironmentStatus.class);
            if (result != null && result.status() != null) return Result.success(result);
        } catch (RuntimeException ignored) {
            // 不把上游异常、地址或凭据回传给节点面板。
        }
        return Result.success(new EnvironmentStatus("unreachable", false, "", "", "", null,
                false, false, "backend", false, "Python AI environment is unreachable"));
    }

    public record EnvironmentStatus(String status, boolean enabled, String model, String device,
                                    String computeType, String loadedModel, boolean dependencyAvailable,
                                    boolean ffmpegAvailable, String detectedFrom, boolean restartRequired,
                                    String message) { }
}
