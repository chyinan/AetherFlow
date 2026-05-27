package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.task.entity.TaskRecord;
import com.aetherflow.task.mapper.TaskRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskRecordMapper taskRecordMapper;

    @GetMapping("/{id}")
    public Result<TaskRecord> getById(@PathVariable Long id) {
        return Result.success(taskRecordMapper.selectById(id));
    }
}

