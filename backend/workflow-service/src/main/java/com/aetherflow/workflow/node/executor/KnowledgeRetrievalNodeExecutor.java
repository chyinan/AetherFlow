package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class KnowledgeRetrievalNodeExecutor extends BaseNodeExecutor {

    private final KnowledgeService knowledgeService;
    private final ObjectMapper objectMapper;

    public KnowledgeRetrievalNodeExecutor(WorkflowNodeMetrics metrics, KnowledgeService knowledgeService) {
        this(metrics, knowledgeService, new ObjectMapper());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public KnowledgeRetrievalNodeExecutor(WorkflowNodeMetrics metrics,
                                          KnowledgeService knowledgeService,
                                          ObjectMapper objectMapper) {
        super(WorkflowNodeTypes.KNOWLEDGE_RETRIEVAL, metrics);
        this.knowledgeService = knowledgeService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Long datasetId = datasetId(config);
        String query = query(context, config);
        int topK = Math.min(50, Math.max(1, NodeValueSupport.intValue(config.get("topK"), 3)));
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "retrievalContext");
        String metadataFilter = metadataFilter(config.get("metadataFilter"));

        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery(query);
        request.setTopK(topK);
        if (!metadataFilter.equalsIgnoreCase("disabled") && !metadataFilter.equalsIgnoreCase("enabled")) {
            request.setMetadataFilter(metadataFilter);
        }
        RetrievalTestResponse response = knowledgeService.runRetrievalTest(datasetId, request);
        List<KnowledgeChunkSummary> results = response.results() == null ? List.of() : response.results();
        String contextText = results.stream()
                .map(KnowledgeChunkSummary::preview)
                .filter(preview -> preview != null && !preview.isBlank())
                .reduce((left, right) -> left + "\n\n" + right)
                .orElse("");

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("datasetId", response.datasetId());
        output.put("query", response.query());
        output.put("retrievalCount", results.size());
        output.put("retrievalContext", contextText);
        output.put("retrievalResults", results);
        output.put("metadataFilter", metadataFilter.isBlank() ? "disabled" : metadataFilter);

        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put(outputVariable, contextText);
        variables.put("retrievalContext", contextText);
        variables.put("retrievalResults", results);
        variables.put("retrievalCount", results.size());
        variables.put("retrievalDatasetId", response.datasetId());
        return buildResult(output, variables);
    }

    private Long datasetId(Map<String, Object> config) {
        Object value = config.getOrDefault("datasetId", config.getOrDefault("dataset", config.get("vectorCollection")));
        if (value == null || String.valueOf(value).isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval node datasetId is required");
        }
        try {
            long parsed = Long.parseLong(String.valueOf(value).trim());
            if (parsed <= 0) {
                throw new NumberFormatException("dataset id must be positive");
            }
            return parsed;
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval node datasetId is invalid");
        }
    }

    private String metadataFilter(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return "";
        }
        try {
            JsonNode node = value instanceof Map<?, ?> map
                    ? objectMapper.valueToTree(map)
                    : objectMapper.readTree(String.valueOf(value));
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("metadataFilter must be a JSON object");
            }
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval metadataFilter must be a JSON object");
        }
    }

    private String query(WorkflowContext context, Map<String, Object> config) {
        String queryVariable = NodeValueSupport.stringValue(config.get("queryVariable"), "question").trim();
        String query = NodeValueSupport.stringValue(context.variables().get(queryVariable)).trim();
        if (query.isBlank()) {
            query = NodeValueSupport.stringValue(config.get("queryText")).trim();
        }
        if (query.isBlank() && !"question".equals(queryVariable)) {
            query = NodeValueSupport.stringValue(context.variables().get("question")).trim();
        }
        if (query.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval node query is required");
        }
        return query;
    }
}
