package com.aetherflow.workflow.client;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import feign.RequestInterceptor;
import org.springframework.context.annotation.Bean;

// pattern: Imperative Shell
public class NotifyInternalFeignConfig {

    @Bean
    RequestInterceptor notifyInternalTokenInterceptor(WorkflowNodeProperties properties) {
        return template -> template.header(InternalHeaders.NOTIFY_SERVICE_TOKEN, properties.issueNotifyInternalToken());
    }
}
