package com.aetherflow.auth.settings.service;

import com.aetherflow.auth.settings.dto.SettingsDtos.BillingSnapshotResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberCreateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsMemberResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileUpdateRequest;
import com.aetherflow.auth.settings.entity.SettingsAuditEventEntity;
import com.aetherflow.auth.settings.entity.SettingsBillingEntity;
import com.aetherflow.auth.settings.entity.SettingsMemberEntity;
import com.aetherflow.auth.settings.entity.SettingsProfileEntity;
import com.aetherflow.auth.settings.mapper.SettingsAuditEventMapper;
import com.aetherflow.auth.settings.mapper.SettingsBillingMapper;
import com.aetherflow.auth.settings.mapper.SettingsMemberMapper;
import com.aetherflow.auth.settings.mapper.SettingsProfileMapper;
import com.aetherflow.auth.settings.service.impl.SettingsServiceImpl;
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

    private SettingsServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new SettingsServiceImpl(profileMapper, memberMapper, billingMapper, auditEventMapper);
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
        when(memberMapper.selectList(any(Wrapper.class))).thenReturn(List.of(owner));
        assertThat(service.listMembers()).extracting(SettingsMemberResponse::role).containsExactly("Owner");

        MemberCreateRequest createRequest = new MemberCreateRequest();
        createRequest.setName("Workflow Operator");
        createRequest.setEmail("ops@aetherflow.mock");
        createRequest.setRole("Operator");
        doAnswer(invocation -> {
            SettingsMemberEntity entity = invocation.getArgument(0);
            entity.setId(2L);
            return 1;
        }).when(memberMapper).insert(any(SettingsMemberEntity.class));

        SettingsMemberResponse created = service.createMember(createRequest);

        assertThat(created.id()).isEqualTo("2");
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
