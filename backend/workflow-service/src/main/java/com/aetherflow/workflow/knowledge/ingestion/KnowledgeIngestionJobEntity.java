package com.aetherflow.workflow.knowledge.ingestion;

// pattern: Imperative Shell

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_knowledge_ingestion_job")
// pattern: Imperative Shell
public class KnowledgeIngestionJobEntity {

    public static final String PENDING = "PENDING";
    public static final String PROCESSING = "PROCESSING";
    public static final String SUCCEEDED = "SUCCEEDED";
    public static final String FAILED = "FAILED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long datasetId;
    private Long documentId;
    private Long ownerUserId;
    private String payloadJson;
    private String status;
    private String leaseToken;
    private Integer attemptCount;
    private LocalDateTime nextAttemptAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
