package com.aetherflow.ai.task;

import com.aetherflow.ai.mapper.AiJobMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class AiJobMapperSqlContractTest {

    @Test
    void leaseMutationsUseDatabaseClockAndOnlyDeclaredParameters() throws Exception {
        String insert = sql(AiJobMapper.class.getMethod(
                "insertAiJobWithLease", com.aetherflow.ai.entity.AiJob.class, long.class), Insert.class);
        String claim = sql(AiJobMapper.class.getMethod(
                "claimAiJobLease", Long.class, String.class, long.class), Update.class);
        String renew = sql(AiJobMapper.class.getMethod(
                "renewAiJobLease", Long.class, String.class, long.class), Update.class);
        String complete = sql(AiJobMapper.class.getMethod(
                "completeAiJobWithLease", Long.class, String.class, String.class, String.class), Update.class);

        assertThat(insert).contains("CURRENT_TIMESTAMP(6)", "INTERVAL #{leaseMicros} MICROSECOND");
        assertThat(claim).contains("CURRENT_TIMESTAMP(6)", "lease_expires_at <= CURRENT_TIMESTAMP(6)");
        assertThat(renew).contains("CURRENT_TIMESTAMP(6)", "lease_expires_at >= CURRENT_TIMESTAMP(6)");
        assertThat(complete).contains("CURRENT_TIMESTAMP(6)", "lease_expires_at >= CURRENT_TIMESTAMP(6)")
                .doesNotContain("#{updatedAt}", "#{completedAt}");
    }

    private <A extends java.lang.annotation.Annotation> String sql(Method method, Class<A> annotationType) {
        if (annotationType == Insert.class) {
            return String.join(" ", method.getAnnotation(Insert.class).value());
        }
        return String.join(" ", method.getAnnotation(Update.class).value());
    }
}
