package com.aetherflow.workflow.ingestion.url;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchRequest;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.IDN;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class UrlIngestionServiceImpl implements UrlIngestionService {

    private static final Pattern TITLE_PATTERN = Pattern.compile("(?is)<title[^>]*>(.*?)</title>");
    private static final Pattern SCRIPT_STYLE_PATTERN = Pattern.compile("(?is)<(script|style|noscript)[^>]*>.*?</\\1>");
    private static final Pattern TAG_PATTERN = Pattern.compile("(?is)<[^>]+>");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    private final UrlIngestionProperties properties;

    @Override
    public UrlFetchResponse fetch(UrlFetchRequest request) {
        URI uri = validateUri(request.getUrl());
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(timeout())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        HttpRequest httpRequest = HttpRequest.newBuilder(uri)
                .timeout(timeout())
                .header("User-Agent", userAgent())
                .header("Accept", "text/html,text/plain;q=0.9,*/*;q=0.2")
                .GET()
                .build();
        try {
            HttpResponse<InputStream> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "url fetch returned non-success status");
            }
            String contentType = response.headers().firstValue("content-type").orElse("");
            String html = readBody(response.body(), maxBytes());
            String title = extractTitle(html);
            String text = truncate(extractText(html), maxTextChars(request.getMaxChars()));
            if (text.isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "url fetch produced empty text");
            }
            return new UrlFetchResponse(uri.toString(), title, text, text.length(), contentType, response.statusCode());
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "url fetch failed");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "url fetch interrupted");
        }
    }

    private URI validateUri(String rawUrl) {
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
        String asciiHost = IDN.toASCII(host);
        if (asciiHost.equalsIgnoreCase("localhost")) {
            rejectPrivateNetwork();
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(asciiHost)) {
                if (isPrivateAddress(address)) {
                    rejectPrivateNetwork();
                }
            }
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url host cannot be resolved");
        }
    }

    private boolean isPrivateAddress(InetAddress address) {
        return !properties.isAllowPrivateNetworks()
                && (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress());
    }

    private void rejectPrivateNetwork() {
        if (!properties.isAllowPrivateNetworks()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "url private network targets are not allowed");
        }
    }

    private String readBody(InputStream inputStream, int maxBytes) throws IOException {
        try (inputStream) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maxBytes, 8192));
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                total += read;
                if (total > maxBytes) {
                    throw new BusinessException(ResultCode.BAD_REQUEST, "url response is too large");
                }
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8);
        }
    }

    private String extractTitle(String html) {
        Matcher matcher = TITLE_PATTERN.matcher(html);
        if (!matcher.find()) {
            return "";
        }
        return normalizeText(stripEntities(matcher.group(1)));
    }

    private String extractText(String html) {
        String withoutScripts = SCRIPT_STYLE_PATTERN.matcher(html).replaceAll(" ");
        String withoutTags = TAG_PATTERN.matcher(withoutScripts).replaceAll(" ");
        return normalizeText(stripEntities(withoutTags));
    }

    private String stripEntities(String value) {
        return value
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
    }

    private String normalizeText(String value) {
        return WHITESPACE_PATTERN.matcher(value).replaceAll(" ").trim();
    }

    private String truncate(String value, int maxChars) {
        return value.length() <= maxChars ? value : value.substring(0, maxChars);
    }

    private int maxBytes() {
        return Math.max(16 * 1024, properties.getMaxBytes());
    }

    private int maxTextChars(Integer requested) {
        int max = Math.max(1_000, properties.getMaxTextChars());
        if (requested == null || requested <= 0) {
            return max;
        }
        return Math.min(max, requested);
    }

    private Duration timeout() {
        return properties.getTimeout() == null ? Duration.ofSeconds(15) : properties.getTimeout();
    }

    private String userAgent() {
        return properties.getUserAgent() == null || properties.getUserAgent().isBlank()
                ? "AetherFlow-UrlIngestion/1.0"
                : properties.getUserAgent();
    }
}
