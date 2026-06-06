package com.aetherflow.notify.service;

import com.aetherflow.common.dto.NotifyMessageDTO;

public interface TelegramNotificationSender {

    void sendIfRequested(NotifyMessageDTO message);
}
