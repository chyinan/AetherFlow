package com.aetherflow.workflow.knowledge.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_knowledge_chunk")
public class KnowledgeChunkEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long datasetId;
    private Long documentId;
    private String source;
    private String preview;
    private Integer tokens;
    private Double score;
    private String status;
    private Integer chunkIndex;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
