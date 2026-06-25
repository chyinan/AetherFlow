package com.aetherflow.auth.settings.controller;

import com.aetherflow.common.core.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/settings")
public class DataSourcesController {

    @GetMapping("/data-sources")
    public Result<List<Map<String, Object>>> listDataSources() {
        return Result.success(List.of());
    }
}
