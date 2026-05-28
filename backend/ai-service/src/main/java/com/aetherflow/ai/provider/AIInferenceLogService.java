package com.aetherflow.ai.provider;

import java.util.List;

public interface AIInferenceLogService {

    void record(AIInferenceLog log);

    List<AIInferenceLog> recent(int limit);
}
