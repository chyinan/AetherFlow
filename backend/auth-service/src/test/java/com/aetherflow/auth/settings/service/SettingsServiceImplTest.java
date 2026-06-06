package com.aetherflow.auth.settings.service;

import com.aetherflow.auth.settings.dto.SettingsDtos.BillingSnapshotResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberCreateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsMemberResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.TelegramIntegrationUpdateRequest;
import com.aetherflow.auth.settings.entity.SettingsAuditEventEntity;
import com.aetherflow.auth.settings.entity.SettingsBillingEntity;
import com.aetherflow.auth.settings.entity.SettingsMemberEntity;
import com.aetherflow.auth.settings.entity.SettingsProfileEntity;
import com.aetherflow.auth.settings.mapper.SettingsAuditEventMapper;
import com.aetherflow.auth.settings.mapper.SettingsBillingMapper;
import com.aetherflow.auth.settings.mapper.SettingsMemberMapper;
import com.aetherflow.auth.settings.mapper.SettingsProfileMapper;
import com.aetherflow.auth.settings.service.impl.SettingsServiceImpl;
import com.aetherflow.auth.settings.service.TelegramBotClient;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SettingsServiceImplTest {

    @Mock
    private SettingsProfileMapper profileMapper;

    @Mock
    private SettingsMemberMapper memberMapper;

    @Mock
    private SettingsBillingMapper billingMapper;

    @Mock
    private SettingsAuditEventMapper auditEventMapper;

    @Mock
    private TelegramBotClient telegramBotClient;

    private SettingsServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new SettingsServiceImpl(profileMapper, memberMapper, billingMapper, auditEventMapper, telegramBotClient);
    }

    @Test
    void createsDefaultProfileWhenMissing() {
        when(profileMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        doAnswer(invocation -> {
            SettingsProfileEntity entity = invocation.getArgument(0);
            entity.setId(1L);
            return 1;
        }).when(profileMapper).insert(any(SettingsProfileEntity.class));

        SettingsProfileResponse response = service.getProfile();

        assertThat(response.name()).isEqualTo("AetherFlow Lab");
        assertThat(response.environment()).isEqualTo("dev");
        verify(profileMapper).insert(any(SettingsProfileEntity.class));
    }

    @Test
    void updatesProfileAndRecordsAudit() {
        when(profileMapper.selectOne(any(Wrapper.class))).thenReturn(profile());
        SettingsProfileUpdateRequest request = new SettingsProfileUpdateRequest();
        request.setName("AetherFlow Production");
        request.setSlug("aetherflow-prod");
        request.setRegion("cn-prod-01");
        request.setEnvironment("prod");
        request.setDefaultTimeoutMin(60);
        request.setRetentionDays(90);

        SettingsProfileResponse response = service.updateProfile(request);

        assertThat(response.name()).isEqualTo("AetherFlow Production");
        ArgumentCaptor<SettingsProfileEntity> profileCaptor = ArgumentCaptor.forClass(SettingsProfileEntity.class);
        verify(profileMapper).updateById(profileCaptor.capture());
        assertThat(profileCaptor.getValue().getEnvironment()).isEqualTo("prod");
        ArgumentCaptor<SettingsAuditEventEntity> auditCaptor = ArgumentCaptor.forClass(SettingsAuditEventEntity.class);
        verify(auditEventMapper).insert(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("updated settings profile");
    }

    @Test
    void listsCreatesPatchesAndDeletesMembers() {
        SettingsMemberEntity owner = member(1L, "Owner", "Owner", "active");
        when(memberMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(memberMapper.selectList(any(Wrapper.class))).thenReturn(List.of(owner));
        assertThat(service.listMembers()).extracting(SettingsMemberResponse::role).containsExactly("Owner");

        MemberCreateRequest createRequest = new MemberCreateRequest();
        createRequest.setName("Workflow Operator");
        createRequest.setEmail("OPS@AETHERFLOW.MOCK ");
        createRequest.setRole("Operator");
        when(memberMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        doAnswer(invocation -> {
            SettingsMemberEntity entity = invocation.getArgument(0);
            entity.setId(2L);
            return 1;
        }).when(memberMapper).insert(any(SettingsMemberEntity.class));

        SettingsMemberResponse created = service.createMember(createRequest);

        assertThat(created.id()).isEqualTo("2");
        assertThat(created.email()).isEqualTo("ops@aetherflow.mock");
        assertThat(created.status()).isEqualTo("invited");

        SettingsMemberEntity existing = member(2L, "Workflow Operator", "Operator", "invited");
        when(memberMapper.selectById(2L)).thenReturn(existing);
        MemberUpdateRequest updateRequest = new MemberUpdateRequest();
        updateRequest.setRole("Admin");
        updateRequest.setStatus("active");

        SettingsMemberResponse updated = service.updateMember(2L, updateRequest);

        assertThat(updated.role()).isEqualTo("Admin");
        assertThat(existing.getStatus()).isEqualTo("active");

        clearInvocations(memberMapper);
        service.deleteMember(2L);

        assertThat(existing.getStatus()).isEqualTo("removed");
        verify(memberMapper).updateById(existing);
    }

    @Test
    void createMemberRejectsDuplicateActiveEmail() {
        MemberCreateRequest request = new MemberCreateRequest();
        request.setName("Another Operator");
        request.setEmail("OPS@AETHERFLOW.MOCK");
        request.setRole("Operator");
        when(memberMapper.selectOne(any(Wrapper.class)))
                .thenReturn(member(2L, "Workflow Operator", "Operator", "invited"));

        assertThatThrownBy(() -> service.createMember(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("settings member email already exists");
    }

    @Test
    void createMemberReactivatesRemovedEmailInsteadOfInsertingDuplicate() {
        SettingsMemberEntity removed = member(2L, "Old Operator", "Operator", "removed");
        removed.setDeletedAt(LocalDateTime.parse("2026-05-30T10:00:00"));
        MemberCreateRequest request = new MemberCreateRequest();
        request.setName("New Operator");
        request.setEmail("OPS@AETHERFLOW.MOCK");
        request.setRole("Admin");
        when(memberMapper.selectOne(any(Wrapper.class))).thenReturn(removed);

        SettingsMemberResponse response = service.createMember(request);

        assertThat(response.id()).isEqualTo("2");
        assertThat(response.name()).isEqualTo("New Operator");
        assertThat(response.email()).isEqualTo("ops@aetherflow.mock");
        assertThat(response.role()).isEqualTo("Admin");
        assertThat(response.status()).isEqualTo("invited");
        assertThat(removed.getDeletedAt()).isNull();
        verify(memberMapper).updateById(removed);
    }

    @Test
    void updateMemberRejectsDuplicateEmail() {
        SettingsMemberEntity current = member(2L, "Workflow Operator", "Operator", "invited");
        SettingsMemberEntity duplicate = member(3L, "Other Operator", "Operator", "active");
        duplicate.setEmail("other@aetherflow.mock");
        when(memberMapper.selectById(2L)).thenReturn(current);
        when(memberMapper.selectOne(any(Wrapper.class))).thenReturn(duplicate);
        MemberUpdateRequest request = new MemberUpdateRequest();
        request.setEmail("OTHER@AETHERFLOW.MOCK");

        assertThatThrownBy(() -> service.updateMember(2L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("settings member email already exists");
    }

    @Test
    void seedsDefaultOwnerWhenMemberTableIsEmpty() {
        when(memberMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        doAnswer(invocation -> {
            SettingsMemberEntity entity = invocation.getArgument(0);
            entity.setId(1L);
            return 1;
        }).when(memberMapper).insert(any(SettingsMemberEntity.class));
        SettingsMemberEntity seededOwner = member(1L, "AetherFlow Operator", "Owner", "active");
        seededOwner.setEmail("aether.operator@aetherflow.local");
        when(memberMapper.selectList(any(Wrapper.class))).thenReturn(List.of(seededOwner));

        List<SettingsMemberResponse> members = service.listMembers();

        assertThat(members).extracting(SettingsMemberResponse::email).containsExactly("aether.operator@aetherflow.local");
        ArgumentCaptor<SettingsMemberEntity> memberCaptor = ArgumentCaptor.forClass(SettingsMemberEntity.class);
        verify(memberMapper).insert(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getRole()).isEqualTo("Owner");
        assertThat(memberCaptor.getValue().getStatus()).isEqualTo("active");
    }

    @Test
    void throwsWhenMemberIsMissing() {
        when(memberMapper.selectById(404L)).thenReturn(null);
        MemberUpdateRequest request = new MemberUpdateRequest();

        assertThatThrownBy(() -> service.updateMember(404L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("settings member not found");
    }

    @Test
    void returnsDefaultBillingWhenMissing() {
        when(billingMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        doAnswer(invocation -> {
            SettingsBillingEntity entity = invocation.getArgument(0);
            entity.setId(1L);
            return 1;
        }).when(billingMapper).insert(any(SettingsBillingEntity.class));

        BillingSnapshotResponse response = service.getBilling();

        assertThat(response.plan()).isEqualTo("Team");
        assertThat(response.seats()).isEqualTo("3 / 10");
    }

    @Test
    void listsRecentAuditEvents() {
        SettingsAuditEventEntity event = new SettingsAuditEventEntity();
        event.setId(1L);
        event.setOccurredAt(LocalDateTime.parse("2026-05-29T02:34:20"));
        event.setActor("aether.operator");
        event.setAction("updated model routing policy");
        event.setTarget("Summary and translate");
        when(auditEventMapper.selectList(any(Wrapper.class))).thenReturn(List.of(event));

        assertThat(service.listAuditEvents(20)).hasSize(1);
        assertThat(service.listAuditEvents(20).get(0).time()).isEqualTo("02:34:20");
    }

    @Test
    void configuresAndTestsTelegramIntegrationWithoutExposingToken() {
        SettingsProfileEntity profile = profile();
        when(profileMapper.selectOne(any(Wrapper.class))).thenReturn(profile);
        TelegramIntegrationUpdateRequest request = new TelegramIntegrationUpdateRequest();
        request.setEnabled(true);
        request.setBotToken("123456:abcdef-token");
        request.setChatId("-10042");

        var response = service.updateTelegramIntegration(request);

        assertThat(response.enabled()).isTrue();
        assertThat(response.botTokenConfigured()).isTrue();
        assertThat(response.botTokenPreview()).isEqualTo("1234...oken");
        assertThat(response.chatId()).isEqualTo("-10042");
        verify(profileMapper).updateById(profile);

        var testResponse = service.testTelegramIntegration();

        assertThat(testResponse.success()).isTrue();
        verify(telegramBotClient).sendMessage("123456:abcdef-token", "-10042", "AetherFlow Telegram integration test");
        assertThat(profile.getTelegramLastTestStatus()).isEqualTo("success");
    }

    private SettingsProfileEntity profile() {
        SettingsProfileEntity profile = new SettingsProfileEntity();
        profile.setId(1L);
        profile.setName("AetherFlow Lab");
        profile.setSlug("aetherflow-lab");
        profile.setRegion("cn-dev-01");
        profile.setEnvironment("dev");
        profile.setDefaultTimeoutMin(45);
        profile.setRetentionDays(30);
        return profile;
    }

    private SettingsMemberEntity member(Long id, String name, String role, String status) {
        SettingsMemberEntity member = new SettingsMemberEntity();
        member.setId(id);
        member.setName(name);
        member.setEmail(name.toLowerCase() + "@aetherflow.mock");
        member.setRole(role);
        member.setStatus(status);
        member.setLastSeen("pending");
        return member;
    }
}
