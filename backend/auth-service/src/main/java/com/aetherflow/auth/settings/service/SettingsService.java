package com.aetherflow.auth.settings.service;

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

import java.util.List;

public interface SettingsService {

    SettingsProfileResponse getProfile();

    SettingsProfileResponse updateProfile(SettingsProfileUpdateRequest request);

    List<SettingsMemberResponse> listMembers();

    SettingsMemberResponse createMember(MemberCreateRequest request);

    SettingsMemberResponse updateMember(Long memberId, MemberUpdateRequest request);

    void deleteMember(Long memberId);

    BillingSnapshotResponse getBilling();

    List<AuditEventResponse> listAuditEvents(int limit);

    TelegramIntegrationResponse getTelegramIntegration();

    TelegramIntegrationResponse updateTelegramIntegration(TelegramIntegrationUpdateRequest request);

    TelegramIntegrationTestResponse testTelegramIntegration();
}
