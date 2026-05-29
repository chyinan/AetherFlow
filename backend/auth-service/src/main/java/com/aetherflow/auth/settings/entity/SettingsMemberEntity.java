package com.aetherflow.auth.settings.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_settings_member")
public class SettingsMemberEntity extends BaseEntity {

    private String name;
    private String email;
    private String role;
    private String status;
    private String lastSeen;
    private LocalDateTime deletedAt;
}
