package com.aetherflow.file.filter;

import com.aetherflow.file.support.FileLogContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class FileTraceFilter extends OncePerRequestFilter {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String USER_ID_HEADER = "X-User-Id";

    private static final Pattern FILE_ID_PATTERN = Pattern.compile("^/files/(\\d+)(?:/.*)?$");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String traceId = resolveTraceId(request);
        FileLogContext.putTraceId(traceId);
        FileLogContext.putUserId(resolveLong(request.getHeader(USER_ID_HEADER)));
        FileLogContext.putFileId(resolvePathFileId(request.getRequestURI()));
        response.setHeader(TRACE_ID_HEADER, traceId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            FileLogContext.clear();
        }
    }

    private String resolveTraceId(HttpServletRequest request) {
        String traceId = request.getHeader(TRACE_ID_HEADER);
        if (StringUtils.hasText(traceId)) {
            return traceId;
        }
        return UUID.randomUUID().toString().replace("-", "");
    }

    private Long resolveLong(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String resolvePathFileId(String requestUri) {
        if (!StringUtils.hasText(requestUri)) {
            return null;
        }
        Matcher matcher = FILE_ID_PATTERN.matcher(requestUri);
        return matcher.matches() ? matcher.group(1) : null;
    }
}
