package com.aetherflow.workflow.config;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MybatisPlusConfigTest {

    @Test
    void registersMySqlPaginationInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusConfig().mybatisPlusInterceptor();

        assertThat(interceptor.getInterceptors())
                .anyMatch(item -> item instanceof PaginationInnerInterceptor);
    }
}
