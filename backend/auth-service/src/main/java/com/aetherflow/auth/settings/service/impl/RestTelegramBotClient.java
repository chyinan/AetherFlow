package com.aetherflow.auth.settings.service.impl;

import com.aetherflow.auth.settings.service.TelegramBotClient;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@Component
public class RestTelegramBotClient implements TelegramBotClient {

    private final RestClient restClient;

    public RestTelegramBotClient(RestClient.Builder builder) {
        this.restClient = builder.build();
    }

    @Override
    public void sendMessage(String botToken, String chatId, String text) {
        try {
            restClient.post()
                    .uri("https://api.telegram.org/bot{botToken}/sendMessage", botToken)
                    .body(Map.of(
                            "chat_id", chatId,
                            "text", text
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "telegram bot send failed");
        }
    }
}
