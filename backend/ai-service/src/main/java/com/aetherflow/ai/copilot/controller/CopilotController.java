package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.aetherflow.common.core.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/copilot")
@RequiredArgsConstructor
public class CopilotController {

    private final CopilotService copilotService;

    @PostMapping("/chat")
    public Result<CopilotChatResponse> chat(@Valid @RequestBody CopilotChatRequest request) {
        return Result.success(copilotService.chat(request));
    }

    @GetMapping("/conversations")
    public Result<List<CopilotConversationSummary>> listConversations(
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(copilotService.listConversations(limit));
    }

    @GetMapping("/conversations/{id}/messages")
    public Result<List<CopilotMessageResponse>> listMessages(@PathVariable Long id) {
        return Result.success(copilotService.listMessages(id));
    }
}
