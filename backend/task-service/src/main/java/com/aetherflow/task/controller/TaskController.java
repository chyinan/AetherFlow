package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.mapper.TaskMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
@Tag(name = "Task", description = "Task query APIs.")
public class TaskController {

    private final TaskMapper taskMapper;

    @GetMapping("/{id}")
    @Operation(summary = "Get task by id.")
    public Result<Task> getById(@PathVariable Long id) {
        return Result.success(taskMapper.selectById(id));
    }
}
