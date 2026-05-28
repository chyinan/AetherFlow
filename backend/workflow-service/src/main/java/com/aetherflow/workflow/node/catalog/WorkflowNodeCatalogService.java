package com.aetherflow.workflow.node.catalog;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class WorkflowNodeCatalogService {

    public List<WorkflowNodeCatalogItem> catalog() {
        return List.of(
                start(),
                end(),
                upload(),
                whisper(),
                summary(),
                export(),
                notifyNode(),
                condition(),
                mock()
        );
    }

    private WorkflowNodeCatalogItem start() {
        return item(
                "START",
                "Start",
                "Control",
                "Entry point for workflow execution. It can seed initial output and variables.",
                List.of(
                        field("output", "OBJECT", false, "Output payload returned by START.", Map.of("started", true)),
                        field("variables", "OBJECT", false, "Variables merged into the workflow context.", Map.of("fileId", 1001))
                ),
                List.of(variable("input", "OBJECT", "Workflow instance input variables.", Map.of("fileId", 1001))),
                List.of(
                        variable("output", "OBJECT", "START output payload.", Map.of("started", true)),
                        variable("variables", "OBJECT", "Variables written into workflow context.", Map.of("fileId", 1001))
                ),
                mapOf("variables", Map.of("fileId", 1001))
        );
    }

    private WorkflowNodeCatalogItem end() {
        return item(
                "END",
                "End",
                "Control",
                "Terminal node for workflow execution. It can publish final output and variables.",
                List.of(
                        field("output", "OBJECT", false, "Final node output payload.", Map.of("completed", true)),
                        field("variables", "OBJECT", false, "Final variables merged into the workflow context.", Map.of("finalStatus", "DONE"))
                ),
                List.of(variable("variables", "OBJECT", "Current workflow variables.", Map.of("summary", "Meeting notes"))),
                List.of(variable("output", "OBJECT", "Final workflow output payload.", Map.of("completed", true))),
                mapOf("output", Map.of("completed", true))
        );
    }

    private WorkflowNodeCatalogItem upload() {
        return item(
                "UPLOAD",
                "Upload Metadata",
                "File",
                "Loads file metadata from file-service by file id and exposes file variables for downstream nodes.",
                List.of(
                        field("fileId", "NUMBER", false, "Fixed file id. Prefer fileIdVariable when binding from workflow input.", 1001),
                        field("fileIdVariable", "STRING", false, "Workflow variable name that contains the file id.", "fileId")
                ),
                List.of(variable("fileId", "NUMBER", "Uploaded file id from workflow input.", 1001)),
                List.of(
                        variable("fileUrl", "STRING", "Public file URL used by WHISPER.", "http://minio/aetherflow/audio.mp3"),
                        variable("fileObjectKey", "STRING", "Object storage key.", "uploads/audio.mp3"),
                        variable("fileSize", "NUMBER", "File size in bytes.", 1048576)
                ),
                mapOf("fileIdVariable", "fileId")
        );
    }

    private WorkflowNodeCatalogItem whisper() {
        return item(
                "WHISPER",
                "Whisper Transcription",
                "AI",
                "Transcribes an audio or video file through ai-service ASR execution.",
                List.of(
                        field("fileUrl", "STRING", false, "Fixed file URL. Prefer fileUrlVariable for workflow binding.", "http://minio/aetherflow/audio.mp3"),
                        field("fileUrlVariable", "STRING", false, "Workflow variable name that contains the file URL.", "fileUrl"),
                        field("language", "STRING", false, "ASR language hint. Use auto when unknown.", "auto"),
                        field("prompt", "STRING", false, "Optional ASR prompt.", "Return punctuation")
                ),
                List.of(variable("fileUrl", "STRING", "File URL produced by UPLOAD.", "http://minio/aetherflow/audio.mp3")),
                List.of(
                        variable("transcription", "STRING", "Transcribed text.", "hello world"),
                        variable("srtObjectKey", "STRING", "Generated subtitle object key.", "subtitles/audio.srt"),
                        variable("durationSeconds", "NUMBER", "Audio or video duration.", 62.5)
                ),
                mapOf("fileUrlVariable", "fileUrl", "language", "auto", "prompt", "")
        );
    }

    private WorkflowNodeCatalogItem summary() {
        return item(
                "SUMMARY",
                "Summary",
                "AI",
                "Summarizes text through ai-service LLM execution.",
                List.of(
                        field("text", "STRING", false, "Fixed text to summarize. Prefer textVariable for workflow binding.", "Long meeting transcript"),
                        field("textVariable", "STRING", false, "Workflow variable used as summary input.", "transcription"),
                        field("language", "STRING", false, "Summary output language.", "Chinese"),
                        field("prompt", "STRING", false, "Extra summarization instruction.", "Focus on action items"),
                        field("provider", "STRING", false, "Optional AI provider override.", "OPENAI", List.of("OPENAI", "OLLAMA")),
                        field("model", "STRING", false, "Optional model override.", "gpt-4o-mini"),
                        field("promptVersion", "STRING", false, "Optional prompt version tag.", "summary-v1")
                ),
                List.of(variable("transcription", "STRING", "Text produced by WHISPER or another upstream node.", "hello world")),
                List.of(variable("summary", "STRING", "Generated summary text.", "Meeting action items")),
                mapOf("textVariable", "transcription", "language", "Chinese", "prompt", "Focus on action items")
        );
    }

    private WorkflowNodeCatalogItem export() {
        return item(
                "EXPORT",
                "Export",
                "File",
                "Exports text or JSON content to MinIO and registers file metadata through file-service.",
                List.of(
                        field("format", "STRING", false, "Export format.", "MARKDOWN", List.of("MARKDOWN", "TXT", "JSON")),
                        field("sourceVariable", "STRING", false, "Workflow variable to export.", "summary"),
                        field("content", "OBJECT", false, "Fixed content. Usually omitted in favor of sourceVariable.", Map.of("summary", "text")),
                        field("fileName", "STRING", false, "Output file name.", "workflow-summary.md"),
                        field("objectKey", "STRING", false, "Optional explicit object storage key.", "workflow/exports/workflow-1/summary.md")
                ),
                List.of(variable("summary", "STRING", "Text generated by SUMMARY.", "Meeting action items")),
                List.of(
                        variable("exportFileId", "NUMBER", "Registered export file id.", 2002),
                        variable("exportFileUrl", "STRING", "Export file public URL.", "http://minio/aetherflow/workflow-summary.md"),
                        variable("exportObjectKey", "STRING", "Export object key.", "workflow/exports/workflow-1/summary.md")
                ),
                mapOf("format", "MARKDOWN", "sourceVariable", "summary", "fileName", "workflow-summary.md")
        );
    }

    private WorkflowNodeCatalogItem notifyNode() {
        return item(
                "NOTIFY",
                "Notify",
                "Notification",
                "Sends a workflow notification through notify-service internal API.",
                List.of(
                        field("userId", "NUMBER", false, "Target user id. Defaults to workflow variable userId.", 10001),
                        field("channel", "STRING", false, "Notification channel.", "WORKFLOW"),
                        field("eventType", "STRING", false, "Notification event type.", "WORKFLOW_COMPLETED"),
                        field("payload", "OBJECT", false, "Additional payload merged with workflow variables.", Map.of("title", "Workflow completed"))
                ),
                List.of(variable("userId", "NUMBER", "Target user id from workflow input.", 10001)),
                List.of(
                        variable("notified", "BOOLEAN", "Whether notify-service accepted the message.", true),
                        variable("eventType", "STRING", "Sent event type.", "WORKFLOW_COMPLETED")
                ),
                mapOf("channel", "WORKFLOW", "eventType", "WORKFLOW_COMPLETED", "payload", Map.of("title", "Workflow completed"))
        );
    }

    private WorkflowNodeCatalogItem condition() {
        return item(
                "CONDITION",
                "Condition",
                "Control",
                "Evaluates a variable and selects a branch key for DAG branch routing.",
                List.of(
                        field("variable", "STRING", true, "Workflow variable to evaluate.", "summary"),
                        field("operator", "STRING", false, "Comparison operator.", "EXISTS",
                                List.of("EQUALS", "NOT_EQUALS", "EXISTS", "NOT_EXISTS", "CONTAINS", "GREATER_THAN", "LESS_THAN")),
                        field("value", "OBJECT", false, "Expected value for comparison.", "approved"),
                        field("trueBranch", "STRING", false, "Branch key when condition is true.", "true"),
                        field("falseBranch", "STRING", false, "Branch key when condition is false.", "false")
                ),
                List.of(variable("variable", "OBJECT", "Workflow variable selected by config.variable.", "approved")),
                List.of(
                        variable("matched", "BOOLEAN", "Condition result.", true),
                        variable("branchKey", "STRING", "Selected branch key.", "true")
                ),
                mapOf("variable", "summary", "operator", "EXISTS", "trueBranch", "true", "falseBranch", "false")
        );
    }

    private WorkflowNodeCatalogItem mock() {
        return item(
                "MOCK",
                "Mock",
                "Utility",
                "Development and testing node that can emit fixed output or simulate delay/failure.",
                List.of(
                        field("output", "OBJECT", false, "Output payload returned by the mock node.", Map.of("ok", true)),
                        field("variables", "OBJECT", false, "Variables merged into workflow context.", Map.of("mockValue", "demo")),
                        field("delayMillis", "NUMBER", false, "Optional artificial delay.", 200),
                        field("fail", "BOOLEAN", false, "Whether the node should fail.", false),
                        field("message", "STRING", false, "Failure message when fail is true.", "mock node failed")
                ),
                List.of(variable("variables", "OBJECT", "Current workflow variables.", Map.of("mockInput", "demo"))),
                List.of(
                        variable("output", "OBJECT", "Configured mock output.", Map.of("ok", true)),
                        variable("variables", "OBJECT", "Configured variables merged into context.", Map.of("mockValue", "demo"))
                ),
                mapOf("output", Map.of("ok", true), "variables", Map.of("mockValue", "demo"), "delayMillis", 0)
        );
    }

    private WorkflowNodeCatalogItem item(String type,
                                         String displayName,
                                         String category,
                                         String description,
                                         List<WorkflowNodeConfigSchema> configSchema,
                                         List<WorkflowNodeVariableSchema> inputVariables,
                                         List<WorkflowNodeVariableSchema> outputVariables,
                                         Map<String, Object> exampleConfig) {
        return new WorkflowNodeCatalogItem(type, displayName, category, description,
                List.copyOf(configSchema), List.copyOf(inputVariables), List.copyOf(outputVariables), Map.copyOf(exampleConfig));
    }

    private WorkflowNodeConfigSchema field(String name, String type, boolean required, String description, Object example) {
        return field(name, type, required, description, example, List.of());
    }

    private WorkflowNodeConfigSchema field(String name,
                                           String type,
                                           boolean required,
                                           String description,
                                           Object example,
                                           List<String> options) {
        return new WorkflowNodeConfigSchema(name, type, required, description, example, List.copyOf(options));
    }

    private WorkflowNodeVariableSchema variable(String name, String type, String description, Object example) {
        return new WorkflowNodeVariableSchema(name, type, description, example);
    }

    private Map<String, Object> mapOf(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }
}
