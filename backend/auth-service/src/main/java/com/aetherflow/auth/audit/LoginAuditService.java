package com.aetherflow.auth.audit;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;

@Slf4j
@Service
public class LoginAuditService {

    public void record(Long userId, String username, String clientIp, String userAgent, LoginStatus status) {
        String previousUserId = MDC.get("userId");
        String auditUserId = userId == null ? "-" : String.valueOf(userId);
        MDC.put("userId", auditUserId);
        try {
            log.info("auth login audit userId={} username={} ip={} loginTime={} status={} userAgent={}",
                    auditUserId,
                    valueOrDefault(username),
                    valueOrDefault(clientIp),
                    OffsetDateTime.now(),
                    status,
                    valueOrDefault(userAgent));
        } finally {
            if (previousUserId == null) {
                MDC.remove("userId");
            } else {
                MDC.put("userId", previousUserId);
            }
        }
    }

    private String valueOrDefault(String value) {
        return StringUtils.hasText(value) ? value.trim() : "-";
    }
}
