package com.aetherflow.ai.cache;

import java.util.Map;

public interface AiTaskCacheService {

    void markStatus(Long taskId, String status);

    void cacheResult(Long taskId, Map<String, Object> result);

    void cacheError(Long taskId, String message);
}
