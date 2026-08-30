package com.aetherflow.workflow.mapper;

import org.apache.ibatis.annotations.Update;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

// pattern: Functional Core
class WorkflowInstanceMapperTransitionTest {

    @Test
    void terminalStateCannotBeOverwrittenByLateRuntimeProjection() throws Exception {
        Method method = WorkflowInstanceMapper.class.getMethod(
                "transitionRuntimeState",
                Long.class,
                String.class,
                String.class,
                LocalDateTime.class,
                LocalDateTime.class);
        Update update = method.getAnnotation(Update.class);

        assertThat(update).isNotNull();
        String sql = String.join(" ", update.value()).replaceAll("\\s+", " ");
        assertThat(sql).contains("status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')");
        assertThat(sql).doesNotContain("OR status = #{status}");
        assertThat(sql).contains("WHEN #{completedAt} IS NULL THEN completed_at");
    }
}
