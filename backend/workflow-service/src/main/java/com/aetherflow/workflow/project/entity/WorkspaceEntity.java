package com.aetherflow.workflow.project.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workspace")
public class WorkspaceEntity {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String slug;
    private String region;
    private String environment;
    private Long ownerUserId;
    private String ownerName;
    private Integer memberCount;
    private Integer defaultTimeoutMin;
    private Integer retentionDays;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
