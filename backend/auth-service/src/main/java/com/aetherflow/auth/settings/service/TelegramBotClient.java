package com.aetherflow.auth.settings.service;

public interface TelegramBotClient {

    void sendMessage(String botToken, String chatId, String text);
}
