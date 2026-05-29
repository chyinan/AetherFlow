package com.aetherflow.workflow.project.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_project")
public class ProjectEntity {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long workspaceId;
    private String workspaceName;
    private String name;
    private String description;
    private Long ownerUserId;
    private String ownerName;
    private String environment;
    private String health;
    private String scenario;
    private String slaTarget;
    private Integer queueDepth;
    private Integer knowledgeCount;
    private String lastRunStatus;
    private Integer workflowCount;
    private Integer activeRunCount;
    private Integer fileCount;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
