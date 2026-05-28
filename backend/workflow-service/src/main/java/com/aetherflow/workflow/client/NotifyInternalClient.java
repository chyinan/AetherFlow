package com.aetherflow.workflow.client;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "notify-service", path = "/notify/internal")
public interface NotifyInternalClient {

    @PostMapping("/send")
    Result<Void> send(@RequestBody NotifyMessageDTO message);
}
