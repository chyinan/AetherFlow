package com.aetherflow.workflow.node.executor;

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
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class KnowledgeRetrievalNodeExecutor extends BaseNodeExecutor {

    private final KnowledgeService knowledgeService;

    public KnowledgeRetrievalNodeExecutor(WorkflowNodeMetrics metrics, KnowledgeService knowledgeService) {
        super(WorkflowNodeTypes.KNOWLEDGE_RETRIEVAL, metrics);
        this.knowledgeService = knowledgeService;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Long datasetId = datasetId(config);
        String query = query(context, config);
        int topK = Math.max(1, NodeValueSupport.intValue(config.get("topK"), 3));
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "retrievalContext");
        String metadataFilter = NodeValueSupport.stringValue(config.get("metadataFilter"), "disabled");

        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery(query);
        request.setTopK(topK);
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
        output.put("metadataFilter", metadataFilter);

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

    private String query(WorkflowContext context, Map<String, Object> config) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, "queryText", "queryVariable", "question");
        String query = NodeValueSupport.stringValue(value).trim();
        if (query.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval node query is required");
        }
        return query;
    }
}
