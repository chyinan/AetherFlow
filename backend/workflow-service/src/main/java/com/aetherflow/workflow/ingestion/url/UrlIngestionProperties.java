package com.aetherflow.workflow.ingestion.url;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@ConfigurationProperties(prefix = "aetherflow.workflow.ingestion.url")
public class UrlIngestionProperties {

    private int maxBytes = 512 * 1024;
    private int maxTextChars = 120_000;
    private Duration timeout = Duration.ofSeconds(15);
    private boolean allowPrivateNetworks = false;
    private String userAgent = "AetherFlow-UrlIngestion/1.0";

    public int getMaxBytes() {
        return maxBytes;
    }

    public void setMaxBytes(int maxBytes) {
        this.maxBytes = maxBytes;
    }

    public int getMaxTextChars() {
        return maxTextChars;
    }

    public void setMaxTextChars(int maxTextChars) {
        this.maxTextChars = maxTextChars;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public boolean isAllowPrivateNetworks() {
        return allowPrivateNetworks;
    }

    public void setAllowPrivateNetworks(boolean allowPrivateNetworks) {
        this.allowPrivateNetworks = allowPrivateNetworks;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }
}
