package com.aetherflow.ai.connection;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

class RedisNodeConnectionRepositoryTest {
    @Test
    @SuppressWarnings("unchecked")
    void serializedProfileSurvivesRepositoryRecreationAndDoesNotReplaceOtherEntries() {
        StringRedisTemplate redis = org.mockito.Mockito.mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashes = org.mockito.Mockito.mock(HashOperations.class);
        when(redis.opsForHash()).thenReturn(hashes);
        Map<Object, Object> saved = new LinkedHashMap<>();
        doAnswer(invocation -> {
            saved.put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashes).put(eq("AI_NODE_CONNECTIONS:USER:7"), anyString(), anyString());
        when(hashes.get(eq("AI_NODE_CONNECTIONS:USER:7"), anyString()))
                .thenAnswer(invocation -> saved.get(invocation.getArgument(1)));
        ObjectMapper mapper = new ObjectMapper();
        RedisNodeConnectionRepository writer = new RedisNodeConnectionRepository(redis, mapper);
        NodeConnectionProfile first = new NodeConnectionProfile("first", "工作站", "COMFYUI", "http://fake-comfy", false);
        NodeConnectionProfile second = new NodeConnectionProfile("second", "图像服务", "STABLE_DIFFUSION_WEBUI", "http://fake-sd", false);
        writer.save(7L, first);
        writer.save(7L, second);

        RedisNodeConnectionRepository reopened = new RedisNodeConnectionRepository(redis, mapper);
        assertThat(reopened.find(7L, "first")).isEqualTo(first);
        assertThat(reopened.find(7L, "second")).isEqualTo(second);
        assertThat(saved).hasSize(2);
    }
}
