package com.aetherflow.workflow.ingestion.url;

// pattern: Functional Core

import java.net.InetAddress;
import java.util.List;
import java.util.Locale;

public final class UrlHostPolicy {

    private UrlHostPolicy() {
    }

    public static boolean isAllowedHost(String host,
                                        List<InetAddress> addresses,
                                        List<String> allowedHosts,
                                        boolean requireHostAllowlist) {
        return isAllowedHost(host, addresses, allowedHosts, requireHostAllowlist, false);
    }

    public static boolean isAllowedHost(String host,
                                        List<InetAddress> addresses,
                                        List<String> allowedHosts,
                                        boolean requireHostAllowlist,
                                        boolean allowPrivateNetworks) {
        String normalizedHost = normalize(host);
        if (normalizedHost.isBlank() || addresses == null || addresses.isEmpty()) {
            return false;
        }
        List<String> normalizedAllowlist = allowedHosts == null ? List.of() : allowedHosts.stream()
                .map(UrlHostPolicy::normalize)
                .filter(value -> !value.isBlank())
                .toList();
        if (requireHostAllowlist && normalizedAllowlist.isEmpty()) {
            return false;
        }
        if (!normalizedAllowlist.isEmpty()
                && normalizedAllowlist.stream().noneMatch(rule -> matches(normalizedHost, rule))) {
            return false;
        }
        return allowPrivateNetworks || addresses.stream().noneMatch(UrlHostPolicy::isPrivateAddress);
    }

    private static boolean matches(String host, String rule) {
        return host.equals(rule) || host.endsWith("." + rule);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\.+$", "");
    }

    private static boolean isPrivateAddress(InetAddress address) {
        byte[] raw = address.getAddress();
        boolean ipv6UniqueLocal = raw.length == 16 && (raw[0] & 0xfe) == 0xfc;
        boolean ipv6LinkLocal = raw.length == 16
                && (raw[0] & 0xff) == 0xfe
                && (raw[1] & 0xc0) == 0x80;
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || ipv6UniqueLocal
                || ipv6LinkLocal;
    }
}
