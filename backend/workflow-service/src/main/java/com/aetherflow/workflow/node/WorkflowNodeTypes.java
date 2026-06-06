package com.aetherflow.workflow.node;

import com.aetherflow.workflow.runtime.api.NodeType;

public final class WorkflowNodeTypes {

    public static final NodeType START = NodeType.of("START");
    public static final NodeType END = NodeType.of("END");
    public static final NodeType UPLOAD = NodeType.of("UPLOAD");
    public static final NodeType OCR = NodeType.of("OCR");
    public static final NodeType WHISPER = NodeType.of("WHISPER");
    public static final NodeType LLM = NodeType.of("LLM");
    public static final NodeType TRANSLATE = NodeType.of("TRANSLATE");
    public static final NodeType SUMMARY = NodeType.of("SUMMARY");
    public static final NodeType EMBEDDING = NodeType.of("EMBEDDING");
    public static final NodeType KNOWLEDGE_RETRIEVAL = NodeType.of("KNOWLEDGE_RETRIEVAL");
    public static final NodeType PROMPT = NodeType.of("PROMPT");
    public static final NodeType IMAGE_GENERATION = NodeType.of("IMAGE_GENERATION");
    public static final NodeType UPSCALE = NodeType.of("UPSCALE");
    public static final NodeType SAVE_IMAGE = NodeType.of("SAVE_IMAGE");
    public static final NodeType EXPORT = NodeType.of("EXPORT");
    public static final NodeType NOTIFY = NodeType.of("NOTIFY");
    public static final NodeType AGENT = NodeType.of("AGENT");
    public static final NodeType QUESTION_UNDERSTAND = NodeType.of("QUESTION_UNDERSTAND");
    public static final NodeType QUESTION_CLASSIFIER = NodeType.of("QUESTION_CLASSIFIER");
    public static final NodeType CONDITION = NodeType.of("CONDITION");
    public static final NodeType HUMAN = NodeType.of("HUMAN");
    public static final NodeType ITERATION = NodeType.of("ITERATION");
    public static final NodeType LOOP = NodeType.of("LOOP");
    public static final NodeType CODE = NodeType.of("CODE");
    public static final NodeType TEMPLATE_TRANSFORM = NodeType.of("TEMPLATE_TRANSFORM");
    public static final NodeType VARIABLE_AGGREGATE = NodeType.of("VARIABLE_AGGREGATE");
    public static final NodeType VARIABLE_ASSIGNER = NodeType.of("VARIABLE_ASSIGNER");
    public static final NodeType PARAMETER_EXTRACTOR = NodeType.of("PARAMETER_EXTRACTOR");
    public static final NodeType MOCK = NodeType.of("MOCK");

    private WorkflowNodeTypes() {
    }
}
