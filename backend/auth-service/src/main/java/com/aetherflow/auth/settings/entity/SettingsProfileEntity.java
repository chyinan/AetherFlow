package com.aetherflow.auth.settings.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_settings_profile")
public class SettingsProfileEntity extends BaseEntity {

    private String name;
    private String slug;
    private String region;
    private String environment;
    private Integer defaultTimeoutMin;
    private Integer retentionDays;
    private Boolean telegramEnabled;
    private String telegramBotToken;
    private String telegramChatId;
    private String telegramLastTestStatus;
}
