package com.aetherflow.auth.settings.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_settings_audit_event")
public class SettingsAuditEventEntity extends BaseEntity {

    private LocalDateTime occurredAt;
    private String actor;
    private String action;
    private String target;
}
