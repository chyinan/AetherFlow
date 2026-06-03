package com.aetherflow.auth.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_oauth_account")
@Schema(description = "OAuth user identity mapped to an AetherFlow user.")
public class OAuthUser extends BaseEntity {

    @Schema(description = "AetherFlow local user id.", example = "7")
    private Long userId;

    @Schema(description = "OAuth provider code.", example = "GOOGLE")
    private String provider;

    @TableField("provider_user_id")
    @Schema(description = "Provider-side immutable user id.", example = "109876543210")
    private String providerId;

    @TableField("provider_email")
    @Schema(description = "Provider-side email.", example = "alice@example.com")
    private String email;

    @TableField("avatar_url")
    @Schema(description = "Provider-side avatar URL.")
    private String avatar;
}
