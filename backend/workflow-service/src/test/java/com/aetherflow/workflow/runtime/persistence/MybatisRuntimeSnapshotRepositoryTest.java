package com.aetherflow.workflow.runtime.persistence;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MybatisRuntimeSnapshotRepositoryTest {

    @Mock
    private WorkflowRuntimeSnapshotMapper mapper;

    private MybatisRuntimeSnapshotRepository repository;

    @BeforeEach
    void setUp() {
        repository = new MybatisRuntimeSnapshotRepository(mapper, new ObjectMapper().findAndRegisterModules());
    }

    @Test
    void savesRuntimeSnapshotAsJsonEntity() {
        when(mapper.selectOne(any())).thenReturn(null);

        repository.save(snapshot("workflow-1", RuntimeState.RUNNING));

        ArgumentCaptor<WorkflowRuntimeSnapshotEntity> entityCaptor =
                ArgumentCaptor.forClass(WorkflowRuntimeSnapshotEntity.class);
        verify(mapper).insert(entityCaptor.capture());
        WorkflowRuntimeSnapshotEntity entity = entityCaptor.getValue();
        assertThat(entity.getWorkflowId()).isEqualTo("workflow-1");
        assertThat(entity.getRuntimeState()).isEqualTo("RUNNING");
        assertThat(entity.getDefinitionJson()).contains("\"name\":\"runtime-persistence-test\"");
        assertThat(entity.getCompletedNodeIdsJson()).contains("node-input");
        assertThat(entity.getVariablesJson()).contains("transcribed");
        assertThat(entity.getNodeOutputsJson()).contains("node-input");
    }

    @Test
    void restoresRuntimeSnapshotFromJsonEntity() throws Exception {
        WorkflowRuntimeSnapshotEntity entity = entity(snapshot("workflow-2", RuntimeState.RETRYING));
        when(mapper.selectOne(any(Wrapper.class))).thenReturn(entity);

        Optional<WorkflowRuntimeSnapshot> restored = repository.findByWorkflowId("workflow-2");

        assertThat(restored).isPresent();
        assertThat(restored.orElseThrow().workflowId()).isEqualTo("workflow-2");
        assertThat(restored.orElseThrow().runtimeState()).isEqualTo(RuntimeState.RETRYING);
        assertThat(restored.orElseThrow().definition().getNodes()).hasSize(2);
        assertThat(restored.orElseThrow().variables()).containsEntry("text", "transcribed");
        assertThat(restored.orElseThrow().nodeOutputs()).containsKey("node-input");
        assertThat(restored.orElseThrow().completedNodeIds()).containsExactly("node-input");
        assertThat(restored.orElseThrow().currentNodeIds()).containsExactly("node-summary");
    }

    @Test
    void serializesConcurrentSavesForTheSameWorkflow() throws Exception {
        WorkflowRuntimeSnapshotEntity existing = entity(snapshot("workflow-lock", RuntimeState.RUNNING));
        CountDownLatch firstRead = new CountDownLatch(1);
        CountDownLatch releaseFirstRead = new CountDownLatch(1);
        CountDownLatch secondRead = new CountDownLatch(1);
        AtomicInteger reads = new AtomicInteger();
        when(mapper.selectOne(any(Wrapper.class))).thenAnswer(invocation -> {
            if (reads.incrementAndGet() == 1) {
                firstRead.countDown();
                assertThat(releaseFirstRead.await(2, TimeUnit.SECONDS)).isTrue();
            } else {
                secondRead.countDown();
            }
            return existing;
        });

        CompletableFuture<Void> first = CompletableFuture.runAsync(() -> repository.save(snapshot("workflow-lock", RuntimeState.RUNNING)));
        assertThat(firstRead.await(1, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<Void> second = CompletableFuture.runAsync(() -> repository.save(snapshot("workflow-lock", RuntimeState.SUCCESS)));

        assertThat(secondRead.await(100, TimeUnit.MILLISECONDS)).isFalse();
        releaseFirstRead.countDown();
        first.get(2, TimeUnit.SECONDS);
        second.get(2, TimeUnit.SECONDS);
        assertThat(reads).hasValue(2);
    }

    private WorkflowRuntimeSnapshotEntity entity(WorkflowRuntimeSnapshot snapshot) throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        WorkflowRuntimeSnapshotEntity entity = new WorkflowRuntimeSnapshotEntity();
        entity.setId(7L);
        entity.setWorkflowId(snapshot.workflowId());
        entity.setTraceId(snapshot.traceId());
        entity.setTaskId(snapshot.taskId());
        entity.setDefinitionId(snapshot.definitionId());
        entity.setDefinitionJson(objectMapper.writeValueAsString(snapshot.definition()));
        entity.setRuntimeState(snapshot.runtimeState().name());
        entity.setCurrentNodeIdsJson(objectMapper.writeValueAsString(snapshot.currentNodeIds()));
        entity.setCompletedNodeIdsJson(objectMapper.writeValueAsString(snapshot.completedNodeIds()));
        entity.setFailedNodeIdsJson(objectMapper.writeValueAsString(snapshot.failedNodeIds()));
        entity.setVariablesJson(objectMapper.writeValueAsString(snapshot.variables()));
        entity.setNodeOutputsJson(objectMapper.writeValueAsString(snapshot.nodeOutputs()));
        entity.setCreatedAt(LocalDateTime.parse("2026-05-28T10:00:00"));
        entity.setUpdatedAt(LocalDateTime.parse("2026-05-28T10:01:00"));
        return entity;
    }

    private static WorkflowRuntimeSnapshot snapshot(String workflowId, RuntimeState state) {
        return new WorkflowRuntimeSnapshot(
                workflowId,
                "trace-" + workflowId,
                "task-" + workflowId,
                10L,
                definition(),
                state,
                List.of("node-summary"),
                List.of("node-input"),
                List.of(),
                Map.of("text", "transcribed"),
                Map.of("node-input", NodeResult.success(Map.of("text", "transcribed"))),
                Instant.parse("2026-05-28T10:00:00Z")
        );
    }

    private static WorkflowDefinitionDTO definition() {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("runtime-persistence-test");
        definition.setNodes(List.of(
                node("node-input", "INPUT", Map.of("next", "node-summary")),
                node("node-summary", "SUMMARY", Map.of())
        ));
        return definition;
    }

    private static WorkflowNodeDTO node(String nodeId, String nodeType, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(nodeId);
        node.setNodeType(nodeType);
        node.setDisplayName(nodeId);
        node.setConfig(config);
        return node;
    }
}
