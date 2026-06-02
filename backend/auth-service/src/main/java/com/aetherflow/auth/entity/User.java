package com.aetherflow.auth.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_user")
@Schema(description = "AetherFlow user account.")
public class User extends BaseEntity {

    @Schema(description = "Unique username.", example = "alice")
    private String username;

    @Schema(description = "Unique normalized email address.", example = "alice@aetherflow.local")
    private String email;

    @Schema(description = "BCrypt password hash.")
    private String passwordHash;

    @Schema(description = "Account status.", example = "ENABLED")
    private String status;
}

