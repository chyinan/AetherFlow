package com.aetherflow.ai.copilot.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_copilot_message")
public class CopilotMessageEntity extends BaseEntity {

    private Long conversationId;
    private String role;
    private String content;
}
