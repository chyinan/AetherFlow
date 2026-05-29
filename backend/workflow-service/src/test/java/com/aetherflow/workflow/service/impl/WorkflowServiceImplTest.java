package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkflowServiceImplTest {

    @Mock
    private WorkflowDefinitionMapper definitionMapper;

    @Mock
    private WorkflowInstanceMapper instanceMapper;

    @Mock
    private WorkflowRuntimeEngine runtimeEngine;

    @Mock
    private ObjectMapper objectMapper;

    private WorkflowRuntimeProperties runtimeProperties;
    private WorkflowServiceImpl workflowService;

    @BeforeEach
    void setUp() {
        runtimeProperties = new WorkflowRuntimeProperties();
        workflowService = new WorkflowServiceImpl(
                definitionMapper,
                instanceMapper,
                runtimeEngine,
                objectMapper,
                runtimeProperties
        );
    }

    @Test
    void startInstanceDelegatesLifecycleToRuntimeEngine() throws Exception {
        WorkflowDefinition definition = definitionEntity();
        WorkflowDefinitionDTO definitionDTO = definitionDTO();
        StartWorkflowRequest request = request();
        doAnswer(invocation -> {
            WorkflowInstance instance = invocation.getArgument(0);
            instance.setId(99L);
            return 1;
        }).when(instanceMapper).insert(any(WorkflowInstance.class));
        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(objectMapper.readValue("{}", WorkflowDefinitionDTO.class)).thenReturn(definitionDTO);
        when(objectMapper.writeValueAsString(request.getInput())).thenReturn("{\"file\":\"audio.mp3\"}");
        when(runtimeEngine.execute(any(WorkflowRuntimeRequest.class))).thenReturn(new WorkflowExecutionSnapshot(
                "99",
                "trace-generated",
                "99",
                RuntimeState.SUCCESS,
                "node-summary",
                Map.of("summary", "done"),
                Map.of(),
                List.of("node-input", "node-summary")
        ));

        WorkflowInstance instance = workflowService.startInstance(10L, request);

        assertThat(instance.getId()).isEqualTo(99L);
        assertThat(instance.getStatus()).isEqualTo("SUCCESS");
        assertThat(instance.getCurrentNodeId()).isEqualTo("node-summary");
        ArgumentCaptor<WorkflowRuntimeRequest> runtimeRequest = ArgumentCaptor.forClass(WorkflowRuntimeRequest.class);
        verify(runtimeEngine).execute(runtimeRequest.capture());
        assertThat(runtimeRequest.getValue().workflowId()).isEqualTo("99");
        assertThat(runtimeRequest.getValue().taskId()).isEqualTo("99");
        assertThat(runtimeRequest.getValue().variables()).containsEntry("file", "audio.mp3");
        assertThat(runtimeRequest.getValue().variables()).containsKey(WorkflowNodeContextKeys.NODE_CONFIGS);
        verify(instanceMapper).updateById(instance);
    }

    @Test
    void startInstanceMarksWorkflowFailedWhenRuntimeFails() throws Exception {
        WorkflowDefinition definition = definitionEntity();
        StartWorkflowRequest request = request();
        doAnswer(invocation -> {
            WorkflowInstance instance = invocation.getArgument(0);
            instance.setId(100L);
            return 1;
        }).when(instanceMapper).insert(any(WorkflowInstance.class));
        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(objectMapper.readValue("{}", WorkflowDefinitionDTO.class)).thenReturn(definitionDTO());
        when(objectMapper.writeValueAsString(request.getInput())).thenReturn("{\"file\":\"audio.mp3\"}");
        when(runtimeEngine.execute(any(WorkflowRuntimeRequest.class)))
                .thenThrow(new IllegalStateException("node failed"));

        assertThatThrownBy(() -> workflowService.startInstance(10L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow runtime execution failed");

        ArgumentCaptor<WorkflowInstance> instanceCaptor = ArgumentCaptor.forClass(WorkflowInstance.class);
        verify(instanceMapper).updateById(instanceCaptor.capture());
        assertThat(instanceCaptor.getValue().getStatus()).isEqualTo("FAILED");
    }

    @Test
    void listsDefinitionsFromMapper() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectList(any())).thenReturn(List.of(definition));

        List<WorkflowDefinition> definitions = workflowService.listDefinitions();

        assertThat(definitions).containsExactly(definition);
    }

    @Test
    void getsDefinitionDetailWhenDefinitionIsEnabled() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        WorkflowDefinition result = workflowService.getDefinition(10L);

        assertThat(result).isSameAs(definition);
    }

    @Test
    void getDefinitionRejectsDeletedDefinition() {
        WorkflowDefinition definition = definitionEntity();
        definition.setStatus("DELETED");
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        assertThatThrownBy(() -> workflowService.getDefinition(10L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow definition not found");
    }

    @Test
    void updatesDefinitionAndIncrementsVersion() throws Exception {
        WorkflowDefinition definition = definitionEntity();
        definition.setVersion(2);
        WorkflowDefinitionDTO request = definitionDTO();
        request.setName("updated");
        request.setDescription("updated description");
        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(objectMapper.writeValueAsString(request)).thenReturn("{\"name\":\"updated\"}");

        WorkflowDefinition result = workflowService.updateDefinition(10L, request);

        assertThat(result.getName()).isEqualTo("updated");
        assertThat(result.getDescription()).isEqualTo("updated description");
        assertThat(result.getDefinitionJson()).isEqualTo("{\"name\":\"updated\"}");
        assertThat(result.getVersion()).isEqualTo(3);
        verify(definitionMapper).updateById(definition);
    }

    @Test
    void deletesDefinitionByStatus() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        workflowService.deleteDefinition(10L);

        assertThat(definition.getStatus()).isEqualTo("DELETED");
        verify(definitionMapper).updateById(definition);
    }

    private static WorkflowDefinition definitionEntity() {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setId(10L);
        definition.setDefinitionJson("{}");
        definition.setVersion(1);
        definition.setStatus("ENABLED");
        return definition;
    }

    private static WorkflowDefinitionDTO definitionDTO() {
        WorkflowNodeDTO input = node("node-input", "INPUT");
        WorkflowNodeDTO summary = node("node-summary", "SUMMARY");
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("test");
        definition.setNodes(List.of(input, summary));
        return definition;
    }

    private static WorkflowNodeDTO node(String nodeId, String nodeType) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(nodeId);
        node.setNodeType(nodeType);
        node.setConfig(Map.of());
        return node;
    }

    private static StartWorkflowRequest request() {
        StartWorkflowRequest request = new StartWorkflowRequest();
        request.setUserId(7L);
        request.setInput(Map.of("file", "audio.mp3"));
        return request;
    }
}
