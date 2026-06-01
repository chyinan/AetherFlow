package com.aetherflow.workflow.knowledge.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_knowledge_dataset")
public class KnowledgeDatasetEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;
    private String description;
    private String status;
    private Integer documentCount;
    private Integer processingDocumentCount;
    private Integer chunkCount;
    private Integer failedChunkCount;
    private Integer hitRate;
    private String embeddingModel;
    private String retrievalMode;
    private Long ownerUserId;
    private String owner;
    private String tagsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
