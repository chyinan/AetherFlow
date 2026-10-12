package com.aetherflow.workflow.ingestion.url;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.IDN;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Locale;

/** 网页提取和 JSON 请求共用同一网络访问策略，不提供节点级绕过开关。 */
@Component
public class UrlRequestPolicy {
    private final UrlIngestionProperties properties;

    public UrlRequestPolicy(UrlIngestionProperties properties) {
        this.properties = properties;
    }

    public URI validateUri(String rawUrl) {
        String normalized = rawUrl == null ? "" : rawUrl.trim();
        if (normalized.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url is required");
        }
        URI uri;
        try {
            uri = new URI(normalized);
        } catch (URISyntaxException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url is invalid");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url scheme must be http or https");
        }
        if (uri.getUserInfo() != null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url user info is not allowed");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url host is required");
        }
        validateHost(host);
        return uri;
    }

    private void validateHost(String host) {
        String asciiHost;
        try {
            asciiHost = IDN.toASCII(host);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url host is invalid");
        }
        try {
            var addresses = Arrays.asList(InetAddress.getAllByName(asciiHost));
            if (!UrlHostPolicy.isAllowedHost(
                    asciiHost,
                    addresses,
                    properties.getAllowedHosts(),
                    properties.isRequireHostAllowlist(),
                    properties.isAllowPrivateNetworks())) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "url host is not allowed");
            }
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url host cannot be resolved");
        }
    }

}
