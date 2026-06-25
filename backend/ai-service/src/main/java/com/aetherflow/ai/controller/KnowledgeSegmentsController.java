package com.aetherflow.ai.controller;

import com.aetherflow.common.core.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/knowledge")
public class KnowledgeSegmentsController {

    @GetMapping("/segments")
    public Result<List<Map<String, Object>>> listKnowledgeSegments() {
        return Result.success(List.of());
    }
}
