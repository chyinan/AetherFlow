package com.aetherflow.file.client;

// pattern: Imperative Shell

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiArtifactAuthorityRequestDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "ai-service", path = "/internal/ai/artifacts")
public interface AiArtifactAuthorityClient {

    @PostMapping("/authority")
    Result<Boolean> validate(
            @RequestHeader(InternalHeaders.AI_SERVICE_TOKEN) String token,
            @RequestBody AiArtifactAuthorityRequestDTO request);
}
