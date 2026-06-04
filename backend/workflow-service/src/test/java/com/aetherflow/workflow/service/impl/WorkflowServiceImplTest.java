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
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.seata.spring.annotation.GlobalTransactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

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
    private ProjectMapper projectMapper;

    @Mock
    private WorkflowRuntimeEngine runtimeEngine;

    @Mock
    private ObjectMapper objectMapper;

    private WorkflowRuntimeProperties runtimeProperties;
    private NodeRegistry nodeRegistry;
    private WorkflowServiceImpl workflowService;

    @BeforeEach
    void setUp() {
        runtimeProperties = new WorkflowRuntimeProperties();
        nodeRegistry = new NodeRegistry(List.of(executor("START"), executor("SUMMARY"), executor("EXPORT"), executor("END")));
        workflowService = new WorkflowServiceImpl(
                definitionMapper,
                instanceMapper,
                projectMapper,
                runtimeEngine,
                objectMapper,
                runtimeProperties,
                nodeRegistry,
                Runnable::run
        );
    }

    @Test
    void startInstanceStartsSeataGlobalTransactionForCrossServiceWrites() throws Exception {
        Method method = WorkflowServiceImpl.class.getMethod("startInstance", Long.class, StartWorkflowRequest.class);

        GlobalTransactional globalTransactional = method.getAnnotation(GlobalTransactional.class);

        assertThat(globalTransactional).isNotNull();
        assertThat(globalTransactional.name()).isEqualTo("aetherflow-start-workflow-instance");
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

        WorkflowInstance instance = asUser(7L, () -> workflowService.startInstance(10L, request));

        assertThat(instance.getId()).isEqualTo(99L);
        assertThat(instance.getStatus()).isEqualTo("RUNNING");
        ArgumentCaptor<WorkflowRuntimeRequest> runtimeRequest = ArgumentCaptor.forClass(WorkflowRuntimeRequest.class);
        verify(runtimeEngine).execute(runtimeRequest.capture());
        assertThat(runtimeRequest.getValue().workflowId()).isEqualTo("99");
        assertThat(runtimeRequest.getValue().taskId()).isEqualTo("99");
        assertThat(runtimeRequest.getValue().variables()).containsEntry("file", "audio.mp3");
        assertThat(runtimeRequest.getValue().variables()).containsKey(WorkflowNodeContextKeys.NODE_CONFIGS);
        ArgumentCaptor<WorkflowInstance> instanceCaptor = ArgumentCaptor.forClass(WorkflowInstance.class);
        verify(instanceMapper).updateById(instanceCaptor.capture());
        assertThat(instanceCaptor.getValue().getId()).isEqualTo(99L);
        assertThat(instanceCaptor.getValue().getStatus()).isEqualTo("SUCCESS");
        assertThat(instanceCaptor.getValue().getCurrentNodeId()).isEqualTo("node-summary");
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

        WorkflowInstance instance = asUser(7L, () -> workflowService.startInstance(10L, request));
        assertThat(instance.getId()).isEqualTo(100L);
        assertThat(instance.getStatus()).isEqualTo("RUNNING");

        ArgumentCaptor<WorkflowInstance> instanceCaptor = ArgumentCaptor.forClass(WorkflowInstance.class);
        verify(instanceMapper).updateById(instanceCaptor.capture());
        assertThat(instanceCaptor.getValue().getId()).isEqualTo(100L);
        assertThat(instanceCaptor.getValue().getStatus()).isEqualTo("FAILED");
    }

    @Test
    void listsDefinitionsFromMapper() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectList(any())).thenReturn(List.of(definition));

        List<WorkflowDefinition> definitions = asUser(7L, workflowService::listDefinitions);

        assertThat(definitions).containsExactly(definition);
    }

    @Test
    void getsDefinitionDetailWhenDefinitionIsEnabled() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        WorkflowDefinition result = asUser(7L, () -> workflowService.getDefinition(10L));

        assertThat(result).isSameAs(definition);
    }

    @Test
    void getDefinitionRejectsDeletedDefinition() {
        WorkflowDefinition definition = definitionEntity();
        definition.setStatus("DELETED");
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.getDefinition(10L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow definition not found");
    }

    @Test
    void createsDefinitionForOwnedProject() throws Exception {
        WorkflowDefinitionDTO request = definitionDTO();
        request.setProjectId(30L);
        when(projectMapper.selectById(30L)).thenReturn(project(30L, 7L));
        when(objectMapper.writeValueAsString(request)).thenReturn("{}");

        WorkflowDefinition definition = asUser(7L, () -> workflowService.createDefinition(request));

        assertThat(definition.getProjectId()).isEqualTo(30L);
        assertThat(definition.getOwnerUserId()).isEqualTo(7L);
        verify(definitionMapper).insert(definition);
    }

    @Test
    void createDefinitionRejectsInvalidDagBeforePersisting() {
        WorkflowDefinitionDTO request = definition(
                node("start", "START", Map.of("next", "missing"))
        );

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.createDefinition(request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow dag invalid");
    }

    @Test
    void createDefinitionRejectsUnsupportedNodeTypeBeforePersisting() {
        WorkflowDefinitionDTO request = definition(
                node("start", "UNSUPPORTED", Map.of())
        );

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.createDefinition(request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported workflow node type");
    }

    @Test
    void rejectsDefinitionProjectOwnedByAnotherUser() {
        WorkflowDefinitionDTO request = definitionDTO();
        request.setProjectId(30L);
        when(projectMapper.selectById(30L)).thenReturn(project(30L, 99L));

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.createDefinition(request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("project not found");
    }

    @Test
    void rejectsDefinitionOwnedByAnotherUser() {
        WorkflowDefinition definition = definitionEntity();
        definition.setOwnerUserId(99L);
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.getDefinition(10L)))
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

        WorkflowDefinition result = asUser(7L, () -> workflowService.updateDefinition(10L, request));

        assertThat(result.getName()).isEqualTo("updated");
        assertThat(result.getDescription()).isEqualTo("updated description");
        assertThat(result.getDefinitionJson()).isEqualTo("{\"name\":\"updated\"}");
        assertThat(result.getVersion()).isEqualTo(3);
        verify(definitionMapper).updateById(definition);
    }

    @Test
    void updateDefinitionRejectsInvalidDagBeforePersisting() {
        WorkflowDefinition definition = definitionEntity();
        WorkflowDefinitionDTO request = definition(
                node("start", "START", Map.of("next", "missing"))
        );
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.updateDefinition(10L, request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow dag invalid");
    }

    @Test
    void startInstanceRejectsInvalidDagBeforeCreatingInstance() throws Exception {
        WorkflowDefinition definition = definitionEntity();
        WorkflowDefinitionDTO invalidDefinition = definition(
                node("start", "START", Map.of("next", "missing"))
        );
        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(objectMapper.readValue("{}", WorkflowDefinitionDTO.class)).thenReturn(invalidDefinition);

        assertThatThrownBy(() -> asUser(7L, () -> workflowService.startInstance(10L, request())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow dag invalid");
    }

    @Test
    void deletesDefinitionByStatus() {
        WorkflowDefinition definition = definitionEntity();
        when(definitionMapper.selectById(10L)).thenReturn(definition);

        asUser(7L, () -> {
            workflowService.deleteDefinition(10L);
            return null;
        });

        assertThat(definition.getStatus()).isEqualTo("DELETED");
        verify(definitionMapper).updateById(definition);
    }

    private static WorkflowDefinition definitionEntity() {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setId(10L);
        definition.setDefinitionJson("{}");
        definition.setVersion(1);
        definition.setStatus("ENABLED");
        definition.setOwnerUserId(7L);
        return definition;
    }

    private static WorkflowDefinitionDTO definitionDTO() {
        WorkflowNodeDTO input = node("node-input", "START");
        WorkflowNodeDTO summary = node("node-summary", "SUMMARY");
        return definition(input, summary);
    }

    private static WorkflowNodeDTO node(String nodeId, String nodeType) {
        return node(nodeId, nodeType, Map.of());
    }

    private static WorkflowNodeDTO node(String nodeId, String nodeType, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(nodeId);
        node.setNodeType(nodeType);
        node.setConfig(config);
        return node;
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("test");
        definition.setNodes(List.of(nodes));
        return definition;
    }

    private static NodeExecutor executor(String type) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of(type);
            }

            @Override
            public NodeResult execute(WorkflowContext context) {
                return NodeResult.success(Map.of());
            }
        };
    }

    private static StartWorkflowRequest request() {
        StartWorkflowRequest request = new StartWorkflowRequest();
        request.setUserId(7L);
        request.setInput(Map.of("file", "audio.mp3"));
        return request;
    }

    private static ProjectEntity project(Long id, Long ownerUserId) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setOwnerUserId(ownerUserId);
        project.setStatus("ACTIVE");
        return project;
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
