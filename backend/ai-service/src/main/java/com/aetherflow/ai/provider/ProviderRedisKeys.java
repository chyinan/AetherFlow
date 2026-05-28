package com.aetherflow.ai.provider;

public final class ProviderRedisKeys {

    public static final String POLICY = "AI_PROVIDER:ROUTING_POLICY";
    public static final String ACTIVE_PROVIDER = "AI_PROVIDER:ACTIVE_PROVIDER";
    public static final String INFERENCE_LOGS = "AI_PROVIDER:INFERENCE_LOGS";

    private ProviderRedisKeys() {
    }

    public static String circuit(AiProviderType provider) {
        return "AI_PROVIDER:" + provider.name() + ":CIRCUIT";
    }

    public static String circuitMarker(AiProviderType provider, ProviderCircuitState state) {
        return "AI_PROVIDER:" + provider.name() + ":" + state.name();
    }

    public static String failures(AiProviderType provider) {
        return "AI_PROVIDER:" + provider.name() + ":FAILURES";
    }

    public static String halfOpenLock(AiProviderType provider) {
        return "AI_PROVIDER:" + provider.name() + ":HALF_OPEN_LOCK";
    }

    public static String health(AiProviderType provider) {
        return "AI_PROVIDER:" + provider.name() + ":HEALTH";
    }

    public static String metric(AiProviderType provider, String metric) {
        return "AI_PROVIDER:METRICS:" + provider.name() + ":" + metric;
    }
}
