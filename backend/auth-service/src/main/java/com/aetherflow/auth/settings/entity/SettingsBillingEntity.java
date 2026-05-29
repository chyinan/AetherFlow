package com.aetherflow.auth.settings.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_settings_billing")
public class SettingsBillingEntity extends BaseEntity {

    private String plan;
    private Integer aiCredits;
    private String monthlyBudget;
    private String currentSpend;
    private String renewalAt;
    private Integer seatUsed;
    private Integer seatLimit;
}
