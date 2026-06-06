package com.aetherflow.auth.settings.controller;

import com.aetherflow.auth.settings.dto.SettingsDtos.AuditEventResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.BillingSnapshotResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberCreateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsMemberResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.TelegramIntegrationResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.TelegramIntegrationTestResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.TelegramIntegrationUpdateRequest;
import com.aetherflow.auth.settings.service.SettingsService;
import com.aetherflow.common.core.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping("/profile")
    public Result<SettingsProfileResponse> getProfile() {
        return Result.success(settingsService.getProfile());
    }

    @PutMapping("/profile")
    public Result<SettingsProfileResponse> updateProfile(
            @Valid @RequestBody SettingsProfileUpdateRequest request) {
        return Result.success(settingsService.updateProfile(request));
    }

    @GetMapping("/members")
    public Result<List<SettingsMemberResponse>> listMembers() {
        return Result.success(settingsService.listMembers());
    }

    @PostMapping("/members")
    public Result<SettingsMemberResponse> createMember(@Valid @RequestBody MemberCreateRequest request) {
        return Result.success(settingsService.createMember(request));
    }

    @PatchMapping("/members/{id}")
    public Result<SettingsMemberResponse> updateMember(@PathVariable Long id,
                                                       @Valid @RequestBody MemberUpdateRequest request) {
        return Result.success(settingsService.updateMember(id, request));
    }

    @DeleteMapping("/members/{id}")
    public Result<Void> deleteMember(@PathVariable Long id) {
        settingsService.deleteMember(id);
        return Result.success();
    }

    @GetMapping("/billing")
    public Result<BillingSnapshotResponse> getBilling() {
        return Result.success(settingsService.getBilling());
    }

    @GetMapping("/audit-events")
    public Result<List<AuditEventResponse>> listAuditEvents(@RequestParam(defaultValue = "20") int limit) {
        return Result.success(settingsService.listAuditEvents(limit));
    }

    @GetMapping("/integrations/telegram")
    public Result<TelegramIntegrationResponse> getTelegramIntegration() {
        return Result.success(settingsService.getTelegramIntegration());
    }

    @PutMapping("/integrations/telegram")
    public Result<TelegramIntegrationResponse> updateTelegramIntegration(
            @RequestBody TelegramIntegrationUpdateRequest request) {
        return Result.success(settingsService.updateTelegramIntegration(request));
    }

    @PostMapping("/integrations/telegram/test")
    public Result<TelegramIntegrationTestResponse> testTelegramIntegration() {
        return Result.success(settingsService.testTelegramIntegration());
    }
}
