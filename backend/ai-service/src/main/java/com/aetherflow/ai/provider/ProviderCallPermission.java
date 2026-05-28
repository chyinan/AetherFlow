package com.aetherflow.ai.provider;

public record ProviderCallPermission(
        boolean allowed,
        boolean halfOpenProbe,
        ProviderCircuitSnapshot snapshot,
        String reason
) {

    public static ProviderCallPermission allow(ProviderCircuitSnapshot snapshot, boolean halfOpenProbe) {
        return new ProviderCallPermission(true, halfOpenProbe, snapshot, null);
    }

    public static ProviderCallPermission reject(ProviderCircuitSnapshot snapshot, String reason) {
        return new ProviderCallPermission(false, false, snapshot, reason);
    }
}
