package com.aetherflow.workflow.service.impl;

// pattern: Imperative Shell

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.controller.WorkflowCopyRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.preflight.WorkflowAiCapabilityPreflightService;
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkflowDefinitionCopyNameTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<Long, WorkflowDefinition> definitions = new HashMap<>();
    private WorkflowServiceImpl service;

    @BeforeEach
    void setUp() {
        WorkflowDefinitionMapper mapper = mock(WorkflowDefinitionMapper.class);
        ProjectMapper projects = mock(ProjectMapper.class);
        ProjectEntity project = new ProjectEntity();
        project.setId(9L);
        project.setOwnerUserId(7L);
        project.setStatus("ACTIVE");
        when(projects.selectById(9L)).thenReturn(project);
        when(mapper.selectById(any())).thenAnswer(call -> definitions.get(call.getArgument(0)));
        AtomicLong nextId = new AtomicLong(100);
        when(mapper.insert(any(WorkflowDefinition.class))).thenAnswer(call -> {
            WorkflowDefinition inserted = call.getArgument(0);
            inserted.setId(nextId.incrementAndGet());
            definitions.put(inserted.getId(), inserted);
            return 1;
        });
        service = new WorkflowServiceImpl(mapper, mock(WorkflowInstanceMapper.class), projects,
                mock(WorkflowRuntimeEngine.class), objectMapper, new WorkflowRuntimeProperties(),
                new NodeRegistry(List.of(executor("START"), executor("END"))),
                new WorkflowNodeCatalogService(), mock(WorkflowAiCapabilityPreflightService.class),
                Runnable::run, mock(WorkflowStartOutboxMapper.class));
    }

    static Stream<String> names() {
        return Stream.of("录制总结", "a".repeat(123), "a".repeat(124), "a".repeat(128),
                "流".repeat(128), "🎵".repeat(128), "a".repeat(122) + "🎵" + "尾部");
    }

    @ParameterizedTest
    @MethodSource("names")
    void defaultCopyNameFitsTheColumnWithoutSplittingUnicode(String name) throws Exception {
        WorkflowDefinition source = source(name);
        String originalJson = source.getDefinitionJson();
        WorkflowDefinition copy = copy(source.getId(), new WorkflowCopyRequest());
        int prefixPoints = Math.min(123, name.codePointCount(0, name.length()));
        String expected = name.substring(0, name.offsetByCodePoints(0, prefixPoints)) + " Copy";
        assertThat(copy.getName()).isEqualTo(expected);
        assertThat(copy.getName().codePointCount(0, copy.getName().length())).isLessThanOrEqualTo(128);
        assertThat(objectMapper.readTree(copy.getDefinitionJson()).get("name").asText()).isEqualTo(expected);
        assertThat(source.getDefinitionJson()).isEqualTo(originalJson);
        assertThat(copy.getDescription()).isEqualTo(source.getDescription());
        assertThat(copy.getProjectId()).isEqualTo(source.getProjectId());
        assertThat(copy.getIdempotencyKey()).isNull();
        assertThat(objectMapper.readTree(copy.getDefinitionJson()).get("nodes"))
                .isEqualTo(objectMapper.readTree(originalJson).get("nodes"));
    }

    @Test
    void repeatedDefaultCopiesRemainValidAndNullOrBlankRequestKeepsTheDefault() throws Exception {
        WorkflowDefinition current = source("a".repeat(128));
        for (int index = 0; index < 3; index++) {
            WorkflowCopyRequest request = null;
            if (index == 1) {
                request = new WorkflowCopyRequest();
                request.setName("   ");
            }
            current = copy(current.getId(), request);
            assertThat(current.getName()).isEqualTo("a".repeat(123) + " Copy");
        }
        assertThat(definitions).hasSize(4);
    }

    @Test
    void explicitCopyNameKeepsItsExistingTrimAndDoesNotAddTheDefaultSuffix() throws Exception {
        WorkflowDefinition source = source("a".repeat(128));
        WorkflowCopyRequest request = new WorkflowCopyRequest();
        request.setName("  单独命名🎵  ");
        assertThat(copy(source.getId(), request).getName()).isEqualTo("单独命名🎵");
        request.setName("b".repeat(128));
        assertThat(copy(source.getId(), request).getName()).isEqualTo("b".repeat(128));
    }

    private WorkflowDefinition source(String name) throws Exception {
        WorkflowNodeDTO start = new WorkflowNodeDTO();
        start.setNodeId("start");
        start.setNodeType("START");
        start.setDisplayName("开始🎵");
        start.setPosition(Map.of("x", 12.5, "y", -8));
        start.setConfig(Map.of("variables", Map.of("title", "录制总结"), "nextNodes", List.of("end")));
        WorkflowNodeDTO end = new WorkflowNodeDTO();
        end.setNodeId("end");
        end.setNodeType("END");
        end.setConfig(Map.of("output", Map.of("title", "title")));
        WorkflowDefinitionDTO graph = new WorkflowDefinitionDTO();
        graph.setName(name);
        graph.setDescription("保留换行\n和 🎵 描述");
        graph.setProjectId(9L);
        graph.setIdempotencyKey("old-create-operation");
        graph.setNodes(List.of(start, end));
        WorkflowDefinition source = new WorkflowDefinition();
        source.setId(10L);
        source.setName(name);
        source.setDescription(graph.getDescription());
        source.setProjectId(9L);
        source.setOwnerUserId(7L);
        source.setStatus("ENABLED");
        source.setDefinitionJson(objectMapper.writeValueAsString(graph));
        definitions.put(source.getId(), source);
        return source;
    }

    private WorkflowDefinition copy(Long sourceId, WorkflowCopyRequest request) {
        return AuthenticatedUserContext.runAs(7L, "aether.operator", () -> service.copyDefinition(sourceId, request));
    }

    private static NodeExecutor executor(String type) {
        return new NodeExecutor() {
            @Override public NodeType nodeType() { return NodeType.of(type); }
            @Override public NodeResult execute(WorkflowContext context) { return NodeResult.success(Map.of()); }
        };
    }
}
