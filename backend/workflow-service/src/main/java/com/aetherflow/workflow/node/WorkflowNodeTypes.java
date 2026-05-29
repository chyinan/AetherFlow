package com.aetherflow.workflow.node;

import com.aetherflow.workflow.runtime.api.NodeType;

public final class WorkflowNodeTypes {

    public static final NodeType START = NodeType.of("START");
    public static final NodeType END = NodeType.of("END");
    public static final NodeType UPLOAD = NodeType.of("UPLOAD");
    public static final NodeType OCR = NodeType.of("OCR");
    public static final NodeType WHISPER = NodeType.of("WHISPER");
    public static final NodeType SUMMARY = NodeType.of("SUMMARY");
    public static final NodeType EXPORT = NodeType.of("EXPORT");
    public static final NodeType NOTIFY = NodeType.of("NOTIFY");
    public static final NodeType CONDITION = NodeType.of("CONDITION");
    public static final NodeType MOCK = NodeType.of("MOCK");

    private WorkflowNodeTypes() {
    }
}
