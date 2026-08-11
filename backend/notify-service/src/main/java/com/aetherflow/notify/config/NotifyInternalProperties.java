package com.aetherflow.notify.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.notify")
// pattern: Imperative Shell
public class NotifyInternalProperties {

    private String internalToken = "aetherflow-notify-internal-dev-token";
}
