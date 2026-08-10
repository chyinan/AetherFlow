package com.aetherflow.workflow.embedding.store;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

// pattern: Imperative Shell
@Data
@TableName("af_vector_store_config")
public class VectorStoreConfigEntity {

    @TableId(type = IdType.INPUT)
    private Long id;

    private String provider;
    private Boolean enabled;
    private String baseUrl;
    private String apiKey;
    private String collection;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
