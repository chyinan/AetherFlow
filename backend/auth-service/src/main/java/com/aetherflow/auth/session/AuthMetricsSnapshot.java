package com.aetherflow.auth.session;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AuthMetricsSnapshot {

    private long onlineUserCount;
    private long tokenCount;
    private long loginFailureCount;
}
