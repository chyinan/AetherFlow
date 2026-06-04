package com.aetherflow.notify.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_notification_record")
public class NotificationRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;
    private String eventId;
    private String channel;
    private String eventType;
    private String payloadJson;
    private String status;
    private LocalDateTime createdAt;
}

