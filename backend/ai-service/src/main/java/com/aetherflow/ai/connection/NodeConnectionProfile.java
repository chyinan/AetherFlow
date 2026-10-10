package com.aetherflow.ai.connection;

public record NodeConnectionProfile(String id, String name, String provider, String baseUrl, boolean readOnly) {
}
