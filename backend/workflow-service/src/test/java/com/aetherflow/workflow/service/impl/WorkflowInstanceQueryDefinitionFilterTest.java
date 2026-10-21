package com.aetherflow.workflow.service.impl;

// pattern: Imperative Shell

import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 按工作流定义 ID 筛选必须精确匹配定义，不能顺带匹配同号的运行实例。
 */
@ExtendWith(MockitoExtension.class)
class WorkflowInstanceQueryDefinitionFilterTest {

    @Mock
    private WorkflowInstanceMapper instanceMapper;

    @Mock
    private WorkflowDefinitionMapper definitionMapper;

    @Mock
    private RuntimeEventStore runtimeEventStore;

    private WorkflowInstanceQueryServiceImpl queryService;

    @BeforeAll
    static void initTableInfo() {
        // 断言查询条件需要 MyBatis-Plus 的实体列信息。
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), WorkflowInstance.class);
    }

    @BeforeEach
    void setUp() {
        queryService = new WorkflowInstanceQueryServiceImpl(instanceMapper, definitionMapper, runtimeEventStore);
    }

    @Test
    void definitionIdFilterDoesNotAlsoMatchInstancesWithTheSameId() {
        when(instanceMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(instanceMapper.selectList(any(Wrapper.class))).thenReturn(List.of(instance(1L, 1L)));

        RunPageResponse response = asUser(7L, () -> queryService.listInstances(null, 1L, null, 1, 20));

        assertThat(response.total()).isEqualTo(1L);
        assertThat(response.items()).hasSize(1);
        // 计数与列表使用同一个筛选条件。
        assertThat(sqlOf(listWrapper())).isEqualTo(sqlOf(countWrapper()));
        // 只按定义 ID 精确筛选，不匹配同号的运行实例。
        assertThat(sqlOf(countWrapper())).contains("definition_id");
        assertThat(sqlOf(countWrapper())).doesNotContain("OR id");
    }

    @Test
    void legacyWorkflowIdKeepsMatchingDefinitionOrInstanceId() {
        when(instanceMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(instanceMapper.selectList(any(Wrapper.class))).thenReturn(List.of(instance(1L, 1L)));

        asUser(7L, () -> queryService.listInstances("1", null, null, 1, 20));

        // 旧入口保持兼容：同时匹配定义 ID 与运行实例 ID。
        assertThat(sqlOf(countWrapper())).contains("definition_id");
        assertThat(sqlOf(countWrapper())).contains("OR id");
    }

    @SuppressWarnings("unchecked")
    private Wrapper<WorkflowInstance> countWrapper() {
        ArgumentCaptor<Wrapper<WorkflowInstance>> captor = ArgumentCaptor.forClass(Wrapper.class);
        org.mockito.Mockito.verify(instanceMapper).selectCount(captor.capture());
        return captor.getValue();
    }

    @SuppressWarnings("unchecked")
    private Wrapper<WorkflowInstance> listWrapper() {
        ArgumentCaptor<Wrapper<WorkflowInstance>> captor = ArgumentCaptor.forClass(Wrapper.class);
        org.mockito.Mockito.verify(instanceMapper).selectList(captor.capture());
        return captor.getValue();
    }

    private static String sqlOf(Wrapper<WorkflowInstance> wrapper) {
        return conditionOf(wrapper.getSqlSegment());
    }

    /** 只比较筛选条件，列表查询额外带有排序与分页后缀。 */
    private static String conditionOf(String sql) {
        int order = sql.indexOf(" ORDER BY");
        return order >= 0 ? sql.substring(0, order) : sql;
    }

    private static WorkflowInstance instance(Long id, Long definitionId) {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(id);
        instance.setDefinitionId(definitionId);
        instance.setUserId(7L);
        instance.setStatus("SUCCESS");
        instance.setCurrentNodeId("node-summary");
        instance.setStartedAt(LocalDateTime.parse("2026-05-29T09:00:00"));
        instance.setCompletedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        instance.setUpdatedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        return instance;
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
