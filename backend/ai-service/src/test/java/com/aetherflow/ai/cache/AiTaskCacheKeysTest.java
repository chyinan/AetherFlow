package com.aetherflow.ai.cache;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiTaskCacheKeysTest {

    @Test
    void buildsStableRedisKeysForTaskStatusResultAndError() {
        assertThat(AiTaskCacheKeys.statusKey(42L)).isEqualTo("aetherflow:ai:task:42:status");
        assertThat(AiTaskCacheKeys.resultKey(42L)).isEqualTo("aetherflow:ai:task:42:result");
        assertThat(AiTaskCacheKeys.errorKey(42L)).isEqualTo("aetherflow:ai:task:42:error");
    }
}
