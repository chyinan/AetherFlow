package com.aetherflow.ai.copilot.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_copilot_conversation")
public class CopilotConversationEntity extends BaseEntity {

    private String title;
    private String workflowId;
    private String projectId;
    private String status;
    private Integer messageCount;
    private LocalDateTime lastMessageAt;
}
