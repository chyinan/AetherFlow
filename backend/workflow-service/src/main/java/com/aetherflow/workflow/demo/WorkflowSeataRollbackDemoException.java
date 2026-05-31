package com.aetherflow.workflow.demo;

public class WorkflowSeataRollbackDemoException extends RuntimeException {

    private final WorkflowSeataDemoResponse response;

    public WorkflowSeataRollbackDemoException(WorkflowSeataDemoResponse response) {
        super("forced Seata rollback demo");
        this.response = response;
    }

    public WorkflowSeataDemoResponse getResponse() {
        return response;
    }
}
