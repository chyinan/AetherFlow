package com.aetherflow.common.dto;

import java.util.List;

// pattern: Functional Core
/** 图像节点只传连接引用与节点选项，不把服务地址写入工作流。 */
public record NodeConnectionValidationRequest(Long userId, List<NodeSelection> nodes) {
    public NodeConnectionValidationRequest {
        nodes = nodes == null ? List.of() : List.copyOf(nodes);
    }

    public record NodeSelection(String nodeId, String nodeType, String connectionId,
                                String provider, String checkpoint, String upscaler,
                                String vae, String sampler, String scheduler, List<String> loras) {
        public NodeSelection {
            loras = loras == null ? List.of() : List.copyOf(loras);
        }

        public NodeSelection(String nodeId, String nodeType, String connectionId,
                             String provider, String checkpoint, String upscaler) {
            this(nodeId, nodeType, connectionId, provider, checkpoint, upscaler,
                    null, null, null, List.of());
        }
    }
}
