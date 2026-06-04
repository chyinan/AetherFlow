package com.aetherflow.workflow.demo;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import io.seata.spring.annotation.GlobalTransactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowSeataDemoServiceTest {

    private WorkflowInstanceMapper instanceMapper;
    private TaskClient taskClient;
    private TaskClientProperties taskClientProperties;
    private WorkflowSeataDemoService service;

    @BeforeEach
    void setUp() {
        instanceMapper = mock(WorkflowInstanceMapper.class);
        taskClient = mock(TaskClient.class);
        taskClientProperties = new TaskClientProperties();
        taskClientProperties.setInternalToken("expected-token");
        service = new WorkflowSeataDemoService(instanceMapper, taskClient, taskClientProperties);
    }

    @Test
    void createDemoTransactionUsesSeataGlobalTransaction() throws Exception {
        Method method = WorkflowSeataDemoService.class.getMethod("createDemoTransaction", int.class, boolean.class);

        GlobalTransactional annotation = method.getAnnotation(GlobalTransactional.class);

        assertThat(annotation).isNotNull();
        assertThat(annotation.name()).isEqualTo("aetherflow-demo-workflow-task");
    }

    @Test
    void createDemoTransactionWritesWorkflowInstanceAndDispatchesTask() {
        when(instanceMapper.insert(any(WorkflowInstance.class))).thenAnswer(invocation -> {
            WorkflowInstance instance = invocation.getArgument(0);
            instance.setId(101L);
            return 1;
        });
        when(taskClient.dispatch(eq("expected-token"), any(TaskMessageDTO.class))).thenReturn(Result.success(202L));

        WorkflowSeataDemoResponse response = service.createDemoTransaction(0, false);

        assertThat(response.workflowInstanceId()).isEqualTo(101L);
        assertThat(response.taskId()).isEqualTo(202L);
        assertThat(response.rollbackRequested()).isFalse();

        ArgumentCaptor<TaskMessageDTO> taskCaptor = ArgumentCaptor.forClass(TaskMessageDTO.class);
        verify(taskClient).dispatch(eq("expected-token"), taskCaptor.capture());
        assertThat(taskCaptor.getValue().getWorkflowInstanceId()).isEqualTo(101L);
        assertThat(taskCaptor.getValue().getNodeId()).isEqualTo("demo-seata-task");
        assertThat(taskCaptor.getValue().getEnqueue()).isFalse();
    }

    @Test
    void createDemoTransactionCanForceRollbackForDashboardDemo() {
        when(instanceMapper.insert(any(WorkflowInstance.class))).thenAnswer(invocation -> {
            WorkflowInstance instance = invocation.getArgument(0);
            instance.setId(103L);
            return 1;
        });
        when(taskClient.dispatch(eq("expected-token"), any(TaskMessageDTO.class))).thenReturn(Result.success(204L));

        assertThatThrownBy(() -> service.createDemoTransaction(0, true))
                .isInstanceOf(WorkflowSeataRollbackDemoException.class)
                .satisfies(exception -> assertThat(((WorkflowSeataRollbackDemoException) exception)
                        .getResponse()
                        .rollbackRequested()).isTrue());
    }
}
