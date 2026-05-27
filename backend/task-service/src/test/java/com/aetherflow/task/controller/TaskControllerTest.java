package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.mapper.TaskMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TaskControllerTest {

    @Test
    void returnsSuccessWithNullDataWhenTaskIsMissingToPreserveQueryContract() {
        TaskMapper taskMapper = mock(TaskMapper.class);
        when(taskMapper.selectById(404L)).thenReturn(null);
        TaskController controller = new TaskController(taskMapper);

        Result<Task> result = controller.getById(404L);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isNull();
    }
}
