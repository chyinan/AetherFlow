package com.aetherflow.notify.service.impl;

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.entity.SettingsTelegramProfile;
import com.aetherflow.notify.mapper.SettingsTelegramProfileMapper;
import com.aetherflow.notify.service.TelegramNotificationSender;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.Collection;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class TelegramNotificationSenderImpl implements TelegramNotificationSender {

    private final SettingsTelegramProfileMapper profileMapper;
    private final RestClient.Builder restClientBuilder;

    @Override
    public void sendIfRequested(NotifyMessageDTO message) {
        if (!requiresTelegram(message)) {
            return;
        }
        try {
            SettingsTelegramProfile profile = profileMapper.selectOne(new LambdaQueryWrapper<SettingsTelegramProfile>()
                    .last("limit 1"));
            if (profile == null
                    || !Boolean.TRUE.equals(profile.getTelegramEnabled())
                    || !StringUtils.hasText(profile.getTelegramBotToken())
                    || !StringUtils.hasText(profile.getTelegramChatId())) {
                return;
            }
            restClientBuilder.build()
                    .post()
                    .uri("https://api.telegram.org/bot{botToken}/sendMessage", profile.getTelegramBotToken())
                    .body(Map.of(
                            "chat_id", profile.getTelegramChatId(),
                            "text", notificationText(message)
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException ignored) {
            // Browser realtime delivery is the primary channel. Telegram delivery failure
            // must not roll back persisted notification records.
        }
    }

    private boolean requiresTelegram(NotifyMessageDTO message) {
        if ("TELEGRAM".equalsIgnoreCase(message.getChannel())) {
            return true;
        }
        Object methods = message.getPayload() == null ? null : message.getPayload().get("methods");
        if (methods instanceof String text) {
            return text.toLowerCase().contains("telegram");
        }
        if (methods instanceof Collection<?> values) {
            return values.stream().map(String::valueOf).anyMatch(value -> "telegram".equalsIgnoreCase(value));
        }
        return false;
    }

    private String notificationText(NotifyMessageDTO message) {
        Map<String, Object> payload = message.getPayload();
        String title = stringPayload(payload, "title", message.getEventType());
        String body = stringPayload(payload, "message", stringPayload(payload, "body", ""));
        if (!StringUtils.hasText(body)) {
            return title;
        }
        return title + "\n\n" + body;
    }

    private String stringPayload(Map<String, Object> payload, String key, String fallback) {
        Object value = payload == null ? null : payload.get(key);
        return value != null && StringUtils.hasText(String.valueOf(value)) ? String.valueOf(value) : fallback;
    }
}
