package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.service.TaskDispatchService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class InternalTaskControllerTest {

    @Test
    void rejectsDispatchWhenInternalTokenIsMissing() {
        TaskDispatchService taskDispatchService = mock(TaskDispatchService.class);
        InternalTaskController controller = new InternalTaskController(taskDispatchService, properties());

        assertThatThrownBy(() -> controller.dispatch(null, taskMessage()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(taskDispatchService);
    }

    @Test
    void rejectsDispatchWhenInternalTokenDoesNotMatch() {
        TaskDispatchService taskDispatchService = mock(TaskDispatchService.class);
        InternalTaskController controller = new InternalTaskController(taskDispatchService, properties());

        assertThatThrownBy(() -> controller.dispatch("wrong-token", taskMessage()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(taskDispatchService);
    }

    @Test
    void dispatchesTaskWhenInternalTokenMatches() {
        TaskDispatchService taskDispatchService = mock(TaskDispatchService.class);
        InternalTaskController controller = new InternalTaskController(taskDispatchService, properties());
        TaskMessageDTO message = taskMessage();
        when(taskDispatchService.dispatch(message)).thenReturn(91L);

        Result<Long> result = controller.dispatch("expected-token", message);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isEqualTo(91L);
        verify(taskDispatchService).dispatch(message);
    }

    @Test
    void rejectsMarkSucceededWhenInternalTokenDoesNotMatch() {
        TaskDispatchService taskDispatchService = mock(TaskDispatchService.class);
        InternalTaskController controller = new InternalTaskController(taskDispatchService, properties());

        assertThatThrownBy(() -> controller.markSucceeded("wrong-token", 91L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(taskDispatchService);
    }

    @Test
    void marksTaskSucceededWhenInternalTokenMatches() {
        TaskDispatchService taskDispatchService = mock(TaskDispatchService.class);
        InternalTaskController controller = new InternalTaskController(taskDispatchService, properties());

        Result<Void> result = controller.markSucceeded("expected-token", 91L);

        assertThat(result.isSuccess()).isTrue();
        verify(taskDispatchService).markSucceeded(91L);
    }

    private static TaskProperties properties() {
        TaskProperties properties = new TaskProperties();
        properties.setInternalToken("expected-token");
        return properties;
    }

    private static TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setWorkflowInstanceId(100L);
        message.setNodeId("node-1");
        message.setNodeType("AI_TRANSCRIPTION");
        return message;
    }
}
