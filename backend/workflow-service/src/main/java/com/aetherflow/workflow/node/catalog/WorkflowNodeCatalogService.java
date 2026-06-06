package com.aetherflow.workflow.node.catalog;

import com.aetherflow.common.dto.WorkflowNodeConfigUiSchema;
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
                ocr(),
                whisper(),
                llm(),
                translate(),
                summary(),
                embedding(),
                knowledgeRetrieval(),
                export(),
                notifyNode(),
                agent(),
                questionUnderstand(),
                questionClassifier(),
                condition(),
                human(),
                iteration(),
                loop(),
                code(),
                templateTransform(),
                variableAggregate(),
                variableAssigner(),
                parameterExtractor(),
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

    private WorkflowNodeCatalogItem ocr() {
        return item(
                "OCR",
                "OCR",
                "File",
                "Recognizes text from document images or PDFs through the configured OCR provider and exposes OCR variables.",
                List.of(
                        field("fileId", "NUMBER", false, "Fixed file id. Prefer fileIdVariable when binding from workflow input.", 1001),
                        field("fileIdVariable", "STRING", false, "Workflow variable name that contains the file id.", "fileId"),
                        field("language", "STRING", false, "OCR language hint. Use auto when unknown.", "auto"),
                        field("enableTable", "BOOLEAN", false, "Whether table extraction should be enabled by providers that support it.", true),
                        field("enableLayout", "BOOLEAN", false, "Whether layout analysis should be enabled by providers that support it.", false),
                        field("mock", "BOOLEAN", false, "Use mock OCR provider for demos without native OCR binaries.", false),
                        field("provider", "STRING", false, "Optional OCR provider override.", "tesseract", List.of("tesseract", "mock"))
                ),
                List.of(variable("fileId", "NUMBER", "Uploaded file id from workflow input or UPLOAD node.", 1001)),
                List.of(
                        variable("ocrText", "STRING", "Recognized OCR text.", "Invoice total: 100.00"),
                        variable("ocrLanguage", "STRING", "OCR language used by the provider.", "eng"),
                        variable("ocrConfidence", "NUMBER", "OCR confidence from 0 to 1 when available.", 0.91),
                        variable("ocrPageCount", "NUMBER", "Recognized page count.", 1)
                ),
                mapOf("fileIdVariable", "fileId", "language", "auto", "enableTable", true, "enableLayout", false)
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

    private WorkflowNodeCatalogItem llm() {
        return item(
                "LLM",
                "LLM",
                "AI",
                "Runs a general LLM prompt through ai-service provider routing and exposes completion variables.",
                List.of(
                        field("prompt", "STRING", false, "Fixed prompt. Prefer promptVariable for workflow binding.", "Draft an answer"),
                        field("promptVariable", "STRING", false, "Workflow variable used as prompt input.", "question"),
                        field("context", "STRING", false, "Fallback fixed context used when prompt is empty.", "Context text"),
                        field("provider", "STRING", false, "Optional AI provider override.", "OLLAMA", List.of("OPENAI", "OLLAMA")),
                        field("model", "STRING", false, "Optional model override.", "llama3"),
                        field("temperature", "NUMBER", false, "Sampling temperature.", 0.3),
                        field("maxTokens", "NUMBER", false, "Optional token cap.", 1200),
                        field("structuredOutput", "BOOLEAN", false, "Whether the model should return structured output.", false)
                ),
                List.of(variable("question", "STRING", "Prompt text from upstream nodes or workflow input.", "Explain the workflow")),
                List.of(
                        variable("completionText", "STRING", "Generated text.", "Generated answer"),
                        variable("completion", "STRING", "Alias of completionText.", "Generated answer"),
                        variable("jsonData", "OBJECT", "Structured output metadata when available.", Map.of())
                ),
                mapOf("promptVariable", "question", "temperature", 0.3, "structuredOutput", false)
        );
    }

    private WorkflowNodeCatalogItem translate() {
        return item(
                "TRANSLATE",
                "Translate",
                "AI",
                "Translates text through ai-service translate execution and exposes translated text variables.",
                List.of(
                        field("text", "STRING", false, "Fixed text. Prefer textVariable for workflow binding.", "你好"),
                        field("textVariable", "STRING", false, "Workflow variable used as source text.", "transcription"),
                        field("sourceLanguage", "STRING", false, "Source language hint.", "auto"),
                        field("targetLanguage", "STRING", false, "Target language.", "en-US"),
                        field("provider", "STRING", false, "Optional AI provider override.", "OLLAMA", List.of("OPENAI", "OLLAMA")),
                        field("model", "STRING", false, "Optional model override.", "llama3"),
                        field("promptVersion", "STRING", false, "Optional prompt version.", "translate-v1")
                ),
                List.of(variable("transcription", "STRING", "Text produced by WHISPER or another upstream node.", "你好")),
                List.of(
                        variable("translatedText", "STRING", "Translated text.", "hello"),
                        variable("translation", "STRING", "Alias of translatedText.", "hello")
                ),
                mapOf("textVariable", "transcription", "sourceLanguage", "auto", "targetLanguage", "en-US")
        );
    }

    private WorkflowNodeCatalogItem embedding() {
        return item(
                "EMBEDDING",
                "Embedding",
                "AI",
                "Splits text into overlapping chunks, embeds each chunk through a provider, and writes mock vector store records for RAG preprocessing.",
                List.of(
                        field("provider", "STRING", false, "Embedding provider name.", "ollama",
                                List.of("ollama", "openai", "huggingface")),
                        field("model", "STRING", false, "Embedding model name.", "nomic-embed-text",
                                List.of("nomic-embed-text", "bge-m3")),
                        field("text", "STRING", false, "Fixed text to embed. Usually omitted in favor of textVariable.", "Document text"),
                        field("textVariable", "STRING", false, "Workflow variable used as embedding input.", "ocrText"),
                        field("chunkSize", "NUMBER", false, "Maximum characters per chunk.", 512),
                        field("overlap", "NUMBER", false, "Overlapping characters between adjacent chunks.", 128),
                        field("vectorCollection", "STRING", false, "Mock vector collection name.", "workflow-embeddings")
                ),
                List.of(variable("ocrText", "STRING", "Text produced by OCR, Split, Summary or another upstream node.", "Knowledge base document text")),
                List.of(
                        variable("embeddingResults", "ARRAY", "Embedding results with vector, dimension, model and chunkIndex.", List.of(Map.of(
                                "chunkIndex", 0,
                                "dimension", 768,
                                "model", "nomic-embed-text"
                        ))),
                        variable("embeddingVectors", "ARRAY", "Raw vectors for downstream vector store nodes.", List.of(List.of(0.12, -0.03, 0.98))),
                        variable("embeddingVectorCount", "NUMBER", "Number of generated vectors.", 4),
                        variable("embeddingModel", "STRING", "Embedding model used by the node.", "nomic-embed-text"),
                        variable("embeddingVectorStore", "ARRAY", "Mock vector store records.", List.of(Map.of(
                                "collection", "workflow-embeddings",
                                "chunkIndex", 0
                        )))
                ),
                mapOf(
                        "provider", "ollama",
                        "model", "nomic-embed-text",
                        "textVariable", "ocrText",
                        "chunkSize", 512,
                        "overlap", 128,
                        "vectorCollection", "workflow-embeddings"
                )
        );
    }

    private WorkflowNodeCatalogItem knowledgeRetrieval() {
        return item(
                "KNOWLEDGE_RETRIEVAL",
                "Knowledge Retrieval",
                "AI",
                "Retrieves top-k chunks from a configured knowledge dataset and exposes context for downstream LLM nodes.",
                List.of(
                        field("datasetId", "STRING", true, "Knowledge dataset id selected from the knowledge base.", "42"),
                        field("queryText", "STRING", false, "Fixed retrieval query. Usually omitted in favor of queryVariable.", "pricing policy"),
                        field("queryVariable", "STRING", false, "Workflow variable used as retrieval query.", "question"),
                        field("topK", "NUMBER", false, "Maximum number of chunks to retrieve.", 3),
                        field("outputVariable", "STRING", false, "Variable name used for joined retrieval context.", "retrievalContext"),
                        field("metadataFilter", "STRING", false, "Metadata filtering mode for retrieval.", "disabled")
                ),
                List.of(variable("question", "STRING", "Query produced by upstream nodes or workflow input.", "How is pricing calculated?")),
                List.of(
                        variable("retrievalContext", "STRING", "Joined retrieved chunk previews for downstream LLM context.", "Pricing policy paragraph"),
                        variable("retrievalResults", "ARRAY", "Retrieved chunks with source, preview, score and status.", List.of(Map.of(
                                "source", "pricing.md",
                                "preview", "Pricing policy paragraph",
                                "score", 0.91
                        ))),
                        variable("retrievalCount", "NUMBER", "Number of retrieved chunks.", 3),
                        variable("retrievalDatasetId", "STRING", "Dataset used for retrieval.", "42")
                ),
                mapOf("datasetId", "42", "queryVariable", "question", "topK", 3, "outputVariable", "retrievalContext", "metadataFilter", "disabled")
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

    private WorkflowNodeCatalogItem agent() {
        return item(
                "AGENT",
                "Agent",
                "AI",
                "Creates a plan for a task through the LLM provider path. Tool execution is intentionally kept outside this node.",
                List.of(
                        field("task", "STRING", false, "Fixed task text. Prefer taskVariable for workflow binding.", "Research this question"),
                        field("taskVariable", "STRING", false, "Workflow variable used as task input.", "question"),
                        field("strategy", "STRING", false, "Planning strategy label.", "plan"),
                        field("model", "STRING", false, "Optional model override.", "llama3")
                ),
                List.of(variable("question", "STRING", "Task input.", "What should happen next?")),
                List.of(variable("plan", "OBJECT", "Generated plan or plan JSON.", Map.of("steps", List.of()))),
                mapOf("taskVariable", "question", "strategy", "plan")
        );
    }

    private WorkflowNodeCatalogItem questionUnderstand() {
        return item(
                "QUESTION_UNDERSTAND",
                "Question Understand",
                "AI",
                "Normalizes a free-form question into intent and entities through LLM structured output.",
                List.of(
                        field("input", "STRING", false, "Fixed question. Prefer inputVariable for workflow binding.", "How do I reset billing?"),
                        field("inputVariable", "STRING", false, "Workflow variable used as question input.", "question"),
                        field("model", "STRING", false, "Optional model override.", "llama3")
                ),
                List.of(variable("question", "STRING", "Question input.", "How do I reset billing?")),
                List.of(variable("intentJson", "OBJECT", "Normalized intent and entities.", Map.of("intent", "billing"))),
                mapOf("inputVariable", "question")
        );
    }

    private WorkflowNodeCatalogItem questionClassifier() {
        return item(
                "QUESTION_CLASSIFIER",
                "Question Classifier",
                "AI",
                "Classifies a question into one route through LLM structured output.",
                List.of(
                        field("input", "STRING", false, "Fixed question. Prefer inputVariable for workflow binding.", "Why was I charged?"),
                        field("inputVariable", "STRING", false, "Workflow variable used as question input.", "question"),
                        field("routes", "ARRAY", false, "Allowed route names.", List.of("billing", "support")),
                        field("threshold", "NUMBER", false, "Confidence threshold hint.", 0.5)
                ),
                List.of(variable("question", "STRING", "Question input.", "Why was I charged?")),
                List.of(variable("routeJson", "OBJECT", "Classification route and confidence.", Map.of("route", "billing"))),
                mapOf("inputVariable", "question", "routes", List.of("billing", "support"), "threshold", 0.5)
        );
    }

    private WorkflowNodeCatalogItem human() {
        return item(
                "HUMAN",
                "Human in the Loop",
                "Control",
                "Requires explicit approval support. Auto-approval is only allowed when configured.",
                List.of(
                        field("reviewer", "STRING", false, "Reviewer identifier.", "ops"),
                        field("methods", "STRING", false, "Notification methods.", "webapp,email"),
                        field("autoApprove", "BOOLEAN", false, "Explicitly allow this node to pass without pause/resume support.", false)
                ),
                List.of(variable("draft", "STRING", "Content requiring review.", "Draft answer")),
                List.of(variable("approved", "BOOLEAN", "Approval result.", true)),
                mapOf("methods", "webapp,email", "autoApprove", false)
        );
    }

    private WorkflowNodeCatalogItem iteration() {
        return item(
                "ITERATION",
                "Iteration",
                "Control",
                "Publishes a bounded list slice for downstream processing. Nested subgraph execution is not performed by this node.",
                List.of(
                        field("inputVariable", "STRING", false, "Workflow list variable.", "items"),
                        field("outputVariable", "STRING", false, "Variable written with selected items.", "iterationItems"),
                        field("maxIterations", "NUMBER", false, "Maximum items to publish.", 100)
                ),
                List.of(variable("items", "ARRAY", "Items to iterate.", List.of("a", "b"))),
                List.of(variable("iterationItems", "ARRAY", "Selected items.", List.of("a", "b"))),
                mapOf("inputVariable", "items", "outputVariable", "iterationItems", "maxIterations", 100)
        );
    }

    private WorkflowNodeCatalogItem loop() {
        return item(
                "LOOP",
                "Loop",
                "Control",
                "Publishes bounded loop state metadata. Runtime-level cyclic scheduling is not introduced.",
                List.of(
                        field("inputVariable", "STRING", false, "Workflow state variable.", "state"),
                        field("outputVariable", "STRING", false, "Variable written with loop state.", "loopState"),
                        field("stopWhen", "STRING", false, "Stop marker matched against the state text.", "done"),
                        field("maxIterations", "NUMBER", false, "Maximum loop count metadata.", 10)
                ),
                List.of(variable("state", "OBJECT", "Loop state.", Map.of("done", false))),
                List.of(variable("loopState", "OBJECT", "Published loop state.", Map.of("done", false))),
                mapOf("inputVariable", "state", "outputVariable", "loopState", "maxIterations", 10)
        );
    }

    private WorkflowNodeCatalogItem code() {
        return item(
                "CODE",
                "Code Execution",
                "Transform",
                "Code execution node with safe default: execution is disabled unless an isolated runtime is explicitly configured.",
                List.of(
                        field("language", "STRING", false, "Requested language.", "python3"),
                        field("code", "STRING", false, "Code text retained for an external isolated runtime.", "def main(): return {}"),
                        field("outputVariable", "STRING", false, "Variable written when isolated runtime integration is enabled.", "codeResult")
                ),
                List.of(variable("payload", "OBJECT", "Input payload.", Map.of())),
                List.of(variable("codeResult", "OBJECT", "Code runtime result.", Map.of())),
                mapOf("language", "python3", "outputVariable", "codeResult")
        );
    }

    private WorkflowNodeCatalogItem templateTransform() {
        return item(
                "TEMPLATE_TRANSFORM",
                "Template Transform",
                "Transform",
                "Renders a simple {{ variable }} template from workflow variables.",
                List.of(
                        field("template", "STRING", true, "Template string.", "Hello {{ name }}"),
                        field("outputVariable", "STRING", false, "Variable written with rendered text.", "renderedText")
                ),
                List.of(variable("name", "STRING", "Template variable.", "AetherFlow")),
                List.of(variable("renderedText", "STRING", "Rendered text.", "Hello AetherFlow")),
                mapOf("template", "{{ arg1 }}", "outputVariable", "renderedText")
        );
    }

    private WorkflowNodeCatalogItem variableAggregate() {
        return item(
                "VARIABLE_AGGREGATE",
                "Variable Aggregator",
                "Transform",
                "Collects selected workflow variables into one map variable.",
                List.of(
                        field("variables", "ARRAY", false, "Variable names to collect.", List.of("left", "right")),
                        field("outputVariable", "STRING", false, "Variable written with aggregate map.", "merged")
                ),
                List.of(variable("left", "OBJECT", "Left branch data.", Map.of("a", 1))),
                List.of(variable("merged", "OBJECT", "Aggregated variables.", Map.of("left", Map.of("a", 1)))),
                mapOf("variables", List.of("left", "right"), "outputVariable", "merged")
        );
    }

    private WorkflowNodeCatalogItem variableAssigner() {
        return item(
                "VARIABLE_ASSIGNER",
                "Variable Assigner",
                "Transform",
                "Writes a configured value or source variable value into a workflow variable.",
                List.of(
                        field("variable", "STRING", true, "Target workflow variable name.", "result"),
                        field("value", "OBJECT", false, "Fixed value.", "ready"),
                        field("sourceVariable", "STRING", false, "Source variable used when value is empty.", "draft")
                ),
                List.of(variable("draft", "OBJECT", "Source value.", "ready")),
                List.of(variable("result", "OBJECT", "Assigned value.", "ready")),
                mapOf("variable", "result", "value", "")
        );
    }

    private WorkflowNodeCatalogItem parameterExtractor() {
        return item(
                "PARAMETER_EXTRACTOR",
                "Parameter Extractor",
                "AI",
                "Extracts structured parameters from text through LLM structured output.",
                List.of(
                        field("input", "STRING", false, "Fixed input text. Prefer inputVariable.", "Book a meeting tomorrow"),
                        field("inputVariable", "STRING", false, "Workflow variable used as input text.", "text"),
                        field("instruction", "STRING", false, "Extraction instruction.", "Extract date and intent"),
                        field("model", "STRING", false, "Optional model override.", "llama3")
                ),
                List.of(variable("text", "STRING", "Input text.", "Book a meeting tomorrow")),
                List.of(variable("paramsJson", "OBJECT", "Extracted parameters.", Map.of("intent", "book_meeting"))),
                mapOf("inputVariable", "text", "instruction", "Extract named parameters")
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
        return field(name, type, required, description, example, List.of(), null);
    }

    private WorkflowNodeConfigSchema field(String name,
                                           String type,
                                           boolean required,
                                           String description,
                                           Object example,
                                           List<String> options) {
        return field(name, type, required, description, example, options, null);
    }

    private WorkflowNodeConfigSchema field(String name,
                                           String type,
                                           boolean required,
                                           String description,
                                           Object example,
                                           List<String> options,
                                           WorkflowNodeConfigUiSchema ui) {
        return new WorkflowNodeConfigSchema(name, type, required, description, example, List.copyOf(options), ui);
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
