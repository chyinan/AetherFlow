package com.aetherflow.ai.connection;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.Comparator;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class RedisNodeConnectionRepository implements NodeConnectionRepository {
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public List<NodeConnectionProfile> list(Long userId) {
        return redisTemplate.opsForHash().values(key(userId)).stream()
                .map(this::decode).sorted(Comparator.comparing(NodeConnectionProfile::name)
                        .thenComparing(NodeConnectionProfile::id)).toList();
    }

    @Override
    public NodeConnectionProfile find(Long userId, String id) {
        Object json = redisTemplate.opsForHash().get(key(userId), id);
        return json == null ? null : decode(json);
    }

    @Override
    public void save(Long userId, NodeConnectionProfile profile) {
        try {
            // 每个连接独立写入，避免保存一个连接时覆盖并发修改的其他连接。
            redisTemplate.opsForHash().put(key(userId), profile.id(), objectMapper.writeValueAsString(profile));
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "节点连接保存失败");
        }
    }

    private NodeConnectionProfile decode(Object json) {
        try {
            return objectMapper.readValue(String.valueOf(json), NodeConnectionProfile.class);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "节点连接配置无法读取");
        }
    }

    private String key(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "节点连接需要有效用户");
        }
        return "AI_NODE_CONNECTIONS:USER:" + userId;
    }
}
