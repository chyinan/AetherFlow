package com.aetherflow.workflow.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class WorkflowInstanceRunDtos {

    private WorkflowInstanceRunDtos() {
    }

    @Schema(description = "Paged workflow run list response.")
    public record RunPageResponse(
            @Schema(description = "Current page number.", example = "1")
            int page,
            @Schema(description = "Page size.", example = "20")
            int pageSize,
            @Schema(description = "Total matched workflow runs.", example = "42")
            long total,
            @Schema(description = "Workflow run items.")
            List<RunView> items
    ) {
        public RunPageResponse {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    @Schema(description = "Frontend workflow run view.")
    public record RunView(
            @Schema(description = "Workflow instance id.", example = "1001")
            Long id,
            @Schema(description = "Workflow definition id.", example = "1")
            Long definitionId,
            @Schema(description = "Frontend workflow id, mapped to definition id.", example = "1")
            String workflowId,
            @Schema(description = "Workflow definition display name.", example = "Meeting summary")
            String workflowName,
            @Schema(description = "Runtime workflow id, mapped to instance id.", example = "1001")
            String runtimeWorkflowId,
            @Schema(description = "Owner user id.", example = "10001")
            Long userId,
            @Schema(description = "Workflow run status.", example = "SUCCESS")
            String status,
            @Schema(description = "Current node id.", example = "node-summary")
            String currentNodeId,
            @Schema(description = "Runtime trace id.", example = "trace-1")
            String traceId,
            @Schema(description = "Workflow start timestamp.")
            LocalDateTime startedAt,
            @Schema(description = "Workflow completion timestamp.")
            LocalDateTime completedAt,
            @Schema(description = "Workflow last update timestamp.")
            LocalDateTime updatedAt,
            @Schema(description = "Run duration in milliseconds.", example = "60000")
            long durationMs,
            @Schema(description = "Runtime node summaries.")
            List<NodeSummary> nodes
    ) {
        public RunView {
            nodes = nodes == null ? List.of() : List.copyOf(nodes);
        }
    }

    @Schema(description = "Workflow run node summary.")
    public record NodeSummary(
            @Schema(description = "Workflow node id.", example = "node-summary")
            String nodeId,
            @Schema(description = "Latest node runtime status.", example = "SUCCESS")
            String status,
            @Schema(description = "Latest runtime event type.", example = "NODE_COMPLETED")
            String latestEventType,
            @Schema(description = "First node start timestamp.")
            Instant startedAt,
            @Schema(description = "Node completion timestamp.")
            Instant completedAt,
            @Schema(description = "Latest runtime event attributes.")
            Map<String, Object> attributes
    ) {
        public NodeSummary {
            attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
        }
    }

    @Schema(description = "Workflow runtime log frame.")
    public record LogFrame(
            @Schema(description = "Frontend log frame id.", example = "event-1")
            String id,
            @Schema(description = "Runtime event id.", example = "event-1")
            String eventId,
            @Schema(description = "Log level.", example = "info")
            String level,
            @Schema(description = "Readable log message.")
            String message,
            @Schema(description = "Runtime workflow id.", example = "1001")
            String workflowId,
            @Schema(description = "Runtime trace id.", example = "trace-1")
            String traceId,
            @Schema(description = "Runtime task id.", example = "1001")
            String taskId,
            @Schema(description = "Workflow node id.", example = "node-summary")
            String nodeId,
            @Schema(description = "Runtime event type.", example = "NODE_COMPLETED")
            String eventType,
            @Schema(description = "Runtime state.", example = "SUCCESS")
            String runtimeState,
            @Schema(description = "Runtime event timestamp.")
            Instant occurredAt,
            @Schema(description = "Runtime event attributes.")
            Map<String, Object> attributes
    ) {
        public LogFrame {
            attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
        }
    }
}
