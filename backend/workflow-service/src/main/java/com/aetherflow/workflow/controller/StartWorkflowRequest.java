package com.aetherflow.workflow.controller;

import lombok.Data;

import java.util.Map;

@Data
public class StartWorkflowRequest {

    private Long userId;
    private Map<String, Object> input;
}

