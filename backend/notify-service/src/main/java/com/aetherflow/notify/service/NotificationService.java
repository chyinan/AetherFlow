package com.aetherflow.notify.service;

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.dto.NotificationRecordResponse;

import java.util.List;

public interface NotificationService {

    void send(NotifyMessageDTO message);

    List<NotificationRecordResponse> list(Long userId, int limit);

    void markAllRead(Long userId);

    void clear(Long userId);
}

