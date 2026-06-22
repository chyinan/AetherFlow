package com.aetherflow.ai.callback;

import com.aetherflow.ai.client.TaskStatusClient;
import com.aetherflow.ai.config.TaskClientProperties;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
public class AiTaskCallbackService {

    private final RabbitTemplate rabbitTemplate;
    private final RestClient callbackRestClient;
    private final TaskStatusClient taskStatusClient;
    private final TaskClientProperties taskClientProperties;

    public AiTaskCallbackService(RabbitTemplate rabbitTemplate,
                                 @Qualifier("aiCallbackRestClient") RestClient callbackRestClient,
                                 TaskStatusClient taskStatusClient,
                                 TaskClientProperties taskClientProperties) {
        this.rabbitTemplate = rabbitTemplate;
        this.callbackRestClient = callbackRestClient;
        this.taskStatusClient = taskStatusClient;
        this.taskClientProperties = taskClientProperties;
    }

    public void notifySuccess(TaskMessageDTO taskMessage, AiNodeResult result) {
        Map<String, Object> payload = basePayload(taskMessage);
        payload.put("status", result.status());
        payload.put("output", result.output());
        payload.put("artifacts", result.artifacts());
        publishNotify("AI_TASK_SUCCEEDED", payload);
        markTaskSucceeded(taskMessage);
        invokeCallbackUrl(taskMessage, payload);
    }

    public void notifyFailure(TaskMessageDTO taskMessage, String message) {
        Map<String, Object> payload = basePayload(taskMessage);
        payload.put("status", "FAILED");
        payload.put("error", message);
        publishNotify("AI_TASK_FAILED", payload);
        invokeCallbackUrl(taskMessage, payload);
    }

    private Map<String, Object> basePayload(TaskMessageDTO taskMessage) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", taskMessage.getTaskId());
        payload.put("workflowInstanceId", taskMessage.getWorkflowInstanceId());
        payload.put("nodeId", taskMessage.getNodeId());
        payload.put("nodeType", taskMessage.getNodeType());
        return payload;
    }

    private void publishNotify(String eventType, Map<String, Object> payload) {
        NotifyMessageDTO notifyMessage = new NotifyMessageDTO();
        notifyMessage.setEventId(eventId(eventType, payload));
        notifyMessage.setEventType(eventType);
        notifyMessage.setChannel("WORKFLOW");
        notifyMessage.setPayload(payload);
        notifyMessage.setOccurredAt(OffsetDateTime.now());
        rabbitTemplate.convertAndSend(RabbitMqNames.NOTIFY_EXCHANGE, RabbitMqNames.NOTIFY_ROUTING_KEY, notifyMessage);
    }

    private String eventId(String eventType, Map<String, Object> payload) {
        Object taskId = payload.get("taskId");
        Object nodeId = payload.get("nodeId");
        if (taskId == null) {
            return eventType;
        }
        return "ai-task:" + taskId + ":" + (nodeId == null ? "" : nodeId) + ":" + eventType;
    }

    private void markTaskSucceeded(TaskMessageDTO taskMessage) {
        if (taskMessage.getTaskId() == null) {
            return;
        }
        try {
            taskStatusClient.markSucceeded(taskClientProperties.getInternalToken(), taskMessage.getTaskId());
        } catch (RuntimeException exception) {
            log.warn("task-service success status callback failed, taskId={}", taskMessage.getTaskId(), exception);
        }
    }

    private void invokeCallbackUrl(TaskMessageDTO taskMessage, Map<String, Object> payload) {
        Object callbackUrl = taskMessage.getPayload() == null ? null : taskMessage.getPayload().get("callbackUrl");
        if (callbackUrl == null || String.valueOf(callbackUrl).isBlank()) {
            return;
        }
        String url = String.valueOf(callbackUrl).trim();
        String rejectionReason = validateCallbackUrl(url);
        if (rejectionReason != null) {
            log.warn("AI task callback url rejected taskId={}, callbackUrl={}, reason={}",
                    taskMessage.getTaskId(), url, rejectionReason);
            return;
        }
        try {
            callbackRestClient.post()
                    .uri(url)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            log.info("AI task callback sent taskId={}, callbackUrl={}", taskMessage.getTaskId(), url);
        } catch (RuntimeException exception) {
            log.warn("AI task callback failed taskId={}, callbackUrl={}", taskMessage.getTaskId(), url, exception);
        }
    }

    /**
     * SSRF guard: caller-supplied callback URLs must target a public HTTP(S)
     * endpoint. Returns a human-readable rejection reason when the URL is
     * disallowed, or {@code null} when the URL is safe to invoke.
     */
    static String validateCallbackUrl(String callbackUrl) {
        if (callbackUrl == null || callbackUrl.isBlank()) {
            return "callback url is empty";
        }
        URI uri;
        try {
            uri = new URI(callbackUrl);
        } catch (URISyntaxException ex) {
            return "callback url is not a valid URI";
        }
        String scheme = uri.getScheme();
        if (scheme == null
                || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            return "callback url must use http or https scheme";
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return "callback url must include a host";
        }
        String lowerHost = host.toLowerCase();
        if ("localhost".equals(lowerHost) || "localhost.".equals(lowerHost)
                || lowerHost.endsWith(".localhost")) {
            return "callback url must not target localhost";
        }
        InetAddress[] resolved;
        try {
            resolved = InetAddress.getAllByName(host);
        } catch (UnknownHostException ex) {
            return "callback url host cannot be resolved: " + host;
        }
        for (InetAddress address : resolved) {
            if (isDisallowedAddress(address)) {
                return "callback url host resolves to a non-public address: " + address.getHostAddress();
            }
        }
        return null;
    }

    private static boolean isDisallowedAddress(InetAddress address) {
        // InetAddress.isSiteLocalAddress() covers RFC 1918 ranges 10.0.0.0/8,
        // 172.16.0.0/12 and 192.168.0.0/16. Also exclude loopback, link-local
        // (169.254.0.0/16), wildcard (0.0.0.0), multicast and reserved ranges,
        // all of which would let a malicious caller reach internal services.
        return address.isLoopbackAddress()
                || address.isAnyLocalAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || isReservedRange(address);
    }

    /**
     * Check for IANA reserved address ranges not covered by the JDK built-in checks
     * above: 240.0.0.0/4 (reserved for future use) and 100.64.0.0/10 (CGNAT /
     * shared address space, RFC 6598).
     */
    private static boolean isReservedRange(InetAddress address) {
        byte[] octets = address.getAddress();
        if (octets.length != 4) {
            // IPv6: block non-global types conservatively via the JDK checks already done.
            return false;
        }
        int first = octets[0] & 0xFF;
        // 240.0.0.0/4 — reserved for future use (Class E)
        if (first >= 240) {
            return true;
        }
        // 100.64.0.0/10 — CGNAT shared address space (RFC 6598)
        if (first == 100) {
            int second = octets[1] & 0xFF;
            return second >= 64 && second <= 127;
        }
        return false;
    }
}
