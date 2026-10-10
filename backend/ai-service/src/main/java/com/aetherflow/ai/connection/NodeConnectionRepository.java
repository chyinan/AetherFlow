package com.aetherflow.ai.connection;

import java.util.List;

public interface NodeConnectionRepository {
    List<NodeConnectionProfile> list(Long userId);

    NodeConnectionProfile find(Long userId, String id);

    void save(Long userId, NodeConnectionProfile profile);
}
