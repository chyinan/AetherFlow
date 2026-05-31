package com.aetherflow.auth.settings.service.impl;

import com.aetherflow.auth.settings.dto.SettingsDtos.AuditEventResponse;
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
import com.aetherflow.auth.settings.service.SettingsService;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class SettingsServiceImpl implements SettingsService {

    private static final String STATUS_ACTIVE = "active";
    private static final String STATUS_INVITED = "invited";
    private static final String STATUS_REMOVED = "removed";
    private static final String AUDIT_ACTOR = "aether.operator";
    private static final String DEFAULT_OWNER_NAME = "AetherFlow Operator";
    private static final String DEFAULT_OWNER_EMAIL = "aether.operator@aetherflow.local";
    private static final String DEFAULT_OWNER_ROLE = "Owner";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final SettingsProfileMapper profileMapper;
    private final SettingsMemberMapper memberMapper;
    private final SettingsBillingMapper billingMapper;
    private final SettingsAuditEventMapper auditEventMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SettingsProfileResponse getProfile() {
        return toProfileResponse(findOrCreateProfile());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SettingsProfileResponse updateProfile(SettingsProfileUpdateRequest request) {
        SettingsProfileEntity profile = findOrCreateProfile();
        profile.setName(request.getName());
        profile.setSlug(request.getSlug());
        profile.setRegion(request.getRegion());
        profile.setEnvironment(request.getEnvironment());
        profile.setDefaultTimeoutMin(defaultNumber(request.getDefaultTimeoutMin(), 45));
        profile.setRetentionDays(defaultNumber(request.getRetentionDays(), 30));
        profile.setUpdatedAt(LocalDateTime.now());
        profileMapper.updateById(profile);
        recordAudit("updated settings profile", profile.getName());
        return toProfileResponse(profile);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<SettingsMemberResponse> listMembers() {
        ensureDefaultOwnerMember();
        LambdaQueryWrapper<SettingsMemberEntity> wrapper = new LambdaQueryWrapper<SettingsMemberEntity>()
                .ne(SettingsMemberEntity::getStatus, STATUS_REMOVED)
                .orderByAsc(SettingsMemberEntity::getId);
        return memberMapper.selectList(wrapper).stream()
                .map(this::toMemberResponse)
                .toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SettingsMemberResponse createMember(MemberCreateRequest request) {
        LocalDateTime now = LocalDateTime.now();
        SettingsMemberEntity member = new SettingsMemberEntity();
        member.setName(request.getName());
        member.setEmail(request.getEmail());
        member.setRole(request.getRole());
        member.setStatus(STATUS_INVITED);
        member.setLastSeen("pending");
        member.setCreatedAt(now);
        member.setUpdatedAt(now);
        memberMapper.insert(member);
        recordAudit("invited settings member", member.getEmail());
        return toMemberResponse(member);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SettingsMemberResponse updateMember(Long memberId, MemberUpdateRequest request) {
        SettingsMemberEntity member = requireMember(memberId);
        if (hasText(request.getName())) {
            member.setName(request.getName());
        }
        if (hasText(request.getEmail())) {
            member.setEmail(request.getEmail());
        }
        if (hasText(request.getRole())) {
            member.setRole(request.getRole());
        }
        if (hasText(request.getStatus())) {
            member.setStatus(request.getStatus());
            if (STATUS_ACTIVE.equals(request.getStatus()) && !hasText(member.getLastSeen())) {
                member.setLastSeen(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
            }
        }
        member.setUpdatedAt(LocalDateTime.now());
        memberMapper.updateById(member);
        recordAudit("updated settings member", member.getEmail());
        return toMemberResponse(member);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteMember(Long memberId) {
        SettingsMemberEntity member = requireMember(memberId);
        member.setStatus(STATUS_REMOVED);
        member.setDeletedAt(LocalDateTime.now());
        member.setUpdatedAt(LocalDateTime.now());
        memberMapper.updateById(member);
        recordAudit("removed settings member", member.getEmail());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public BillingSnapshotResponse getBilling() {
        return toBillingResponse(findOrCreateBilling());
    }

    @Override
    public List<AuditEventResponse> listAuditEvents(int limit) {
        int safeLimit = limit <= 0 ? 20 : Math.min(limit, 100);
        LambdaQueryWrapper<SettingsAuditEventEntity> wrapper = new LambdaQueryWrapper<SettingsAuditEventEntity>()
                .orderByDesc(SettingsAuditEventEntity::getOccurredAt)
                .orderByDesc(SettingsAuditEventEntity::getId)
                .last("limit " + safeLimit);
        return auditEventMapper.selectList(wrapper).stream()
                .map(this::toAuditEventResponse)
                .toList();
    }

    private SettingsProfileEntity findOrCreateProfile() {
        SettingsProfileEntity profile = profileMapper.selectOne(new LambdaQueryWrapper<SettingsProfileEntity>()
                .last("limit 1"));
        if (profile != null) {
            return profile;
        }
        LocalDateTime now = LocalDateTime.now();
        profile = new SettingsProfileEntity();
        profile.setName("AetherFlow Lab");
        profile.setSlug("aetherflow-lab");
        profile.setRegion("cn-dev-01");
        profile.setEnvironment("dev");
        profile.setDefaultTimeoutMin(45);
        profile.setRetentionDays(30);
        profile.setCreatedAt(now);
        profile.setUpdatedAt(now);
        profileMapper.insert(profile);
        return profile;
    }

    private SettingsBillingEntity findOrCreateBilling() {
        SettingsBillingEntity billing = billingMapper.selectOne(new LambdaQueryWrapper<SettingsBillingEntity>()
                .last("limit 1"));
        if (billing != null) {
            return billing;
        }
        LocalDateTime now = LocalDateTime.now();
        billing = new SettingsBillingEntity();
        billing.setPlan("Team");
        billing.setAiCredits(200);
        billing.setMonthlyBudget("$300");
        billing.setCurrentSpend("$42.18");
        billing.setRenewalAt("2026-06-01");
        billing.setSeatUsed(3);
        billing.setSeatLimit(10);
        billing.setCreatedAt(now);
        billing.setUpdatedAt(now);
        billingMapper.insert(billing);
        return billing;
    }

    private SettingsMemberEntity requireMember(Long memberId) {
        SettingsMemberEntity member = memberMapper.selectById(memberId);
        if (member == null || STATUS_REMOVED.equals(member.getStatus())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "settings member not found");
        }
        return member;
    }

    private void ensureDefaultOwnerMember() {
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<SettingsMemberEntity>()
                .ne(SettingsMemberEntity::getStatus, STATUS_REMOVED));
        if (memberCount != null && memberCount > 0) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        SettingsMemberEntity member = new SettingsMemberEntity();
        member.setName(DEFAULT_OWNER_NAME);
        member.setEmail(DEFAULT_OWNER_EMAIL);
        member.setRole(DEFAULT_OWNER_ROLE);
        member.setStatus(STATUS_ACTIVE);
        member.setLastSeen(now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
        member.setCreatedAt(now);
        member.setUpdatedAt(now);
        memberMapper.insert(member);
    }

    private void recordAudit(String action, String target) {
        SettingsAuditEventEntity event = new SettingsAuditEventEntity();
        LocalDateTime now = LocalDateTime.now();
        event.setOccurredAt(now);
        event.setActor(AUDIT_ACTOR);
        event.setAction(action);
        event.setTarget(target);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        auditEventMapper.insert(event);
    }

    private SettingsProfileResponse toProfileResponse(SettingsProfileEntity profile) {
        return new SettingsProfileResponse(
                profile.getName(),
                profile.getSlug(),
                profile.getRegion(),
                profile.getEnvironment(),
                defaultNumber(profile.getDefaultTimeoutMin(), 45),
                defaultNumber(profile.getRetentionDays(), 30)
        );
    }

    private SettingsMemberResponse toMemberResponse(SettingsMemberEntity member) {
        return new SettingsMemberResponse(
                stringId(member.getId()),
                member.getName(),
                member.getEmail(),
                member.getRole(),
                member.getStatus(),
                defaultText(member.getLastSeen(), "pending")
        );
    }

    private BillingSnapshotResponse toBillingResponse(SettingsBillingEntity billing) {
        return new BillingSnapshotResponse(
                billing.getPlan(),
                defaultNumber(billing.getAiCredits(), 0),
                billing.getMonthlyBudget(),
                billing.getCurrentSpend(),
                billing.getRenewalAt(),
                defaultNumber(billing.getSeatUsed(), 0) + " / " + defaultNumber(billing.getSeatLimit(), 0)
        );
    }

    private AuditEventResponse toAuditEventResponse(SettingsAuditEventEntity event) {
        return new AuditEventResponse(
                stringId(event.getId()),
                event.getOccurredAt() == null ? null : event.getOccurredAt().format(TIME_FORMATTER),
                event.getActor(),
                event.getAction(),
                event.getTarget()
        );
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String defaultText(String value, String fallback) {
        return hasText(value) ? value : fallback;
    }

    private Integer defaultNumber(Integer value, int fallback) {
        return Objects.requireNonNullElse(value, fallback);
    }

    private String stringId(Long value) {
        return value == null ? null : String.valueOf(value);
    }
}
