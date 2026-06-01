package com.aetherflow.auth.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_oauth_account")
@Schema(description = "External OAuth account bound to an AetherFlow user.")
public class OAuthAccount extends BaseEntity {

    @Schema(description = "AetherFlow local user id.", example = "7")
    private Long userId;

    @Schema(description = "OAuth provider code.", example = "GITHUB")
    private String provider;

    @Schema(description = "Provider-side immutable user id.", example = "123456")
    private String providerUserId;

    @Schema(description = "Provider-side username.", example = "octocat")
    private String providerUsername;

    @Schema(description = "Provider-side public email when available.", example = "octocat@example.com")
    private String providerEmail;

    @Schema(description = "Provider-side avatar URL.")
    private String avatarUrl;
}
