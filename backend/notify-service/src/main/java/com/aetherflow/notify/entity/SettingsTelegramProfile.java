package com.aetherflow.notify.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("af_settings_profile")
public class SettingsTelegramProfile {

    private Long id;
    private Boolean telegramEnabled;
    private String telegramBotToken;
    private String telegramChatId;
}
