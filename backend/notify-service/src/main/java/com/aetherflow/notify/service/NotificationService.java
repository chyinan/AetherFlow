package com.aetherflow.notify.service;

import com.aetherflow.common.dto.NotifyMessageDTO;

public interface NotificationService {

    void send(NotifyMessageDTO message);
}

