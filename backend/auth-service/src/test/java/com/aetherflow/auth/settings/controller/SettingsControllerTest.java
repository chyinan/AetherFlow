package com.aetherflow.auth.settings.controller;

import com.aetherflow.auth.settings.dto.SettingsDtos.AuditEventResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.BillingSnapshotResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberCreateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.MemberUpdateRequest;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsMemberResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileResponse;
import com.aetherflow.auth.settings.dto.SettingsDtos.SettingsProfileUpdateRequest;
import com.aetherflow.auth.settings.service.SettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SettingsControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void readsAndUpdatesWorkspaceProfile() throws Exception {
        SettingsService service = mock(SettingsService.class);
        when(service.getProfile()).thenReturn(profile("AetherFlow Lab"));
        SettingsProfileUpdateRequest request = new SettingsProfileUpdateRequest();
        request.setName("AetherFlow Production");
        request.setSlug("aetherflow-prod");
        request.setRegion("cn-prod-01");
        request.setEnvironment("prod");
        request.setDefaultTimeoutMin(60);
        request.setRetentionDays(90);
        when(service.updateProfile(request)).thenReturn(profile("AetherFlow Production"));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new SettingsController(service)).build();

        mockMvc.perform(get("/settings/profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.name").value("AetherFlow Lab"))
                .andExpect(jsonPath("$.data.environment").value("dev"));

        mockMvc.perform(put("/settings/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("AetherFlow Production"));

        verify(service).updateProfile(request);
    }

    @Test
    void managesWorkspaceMembers() throws Exception {
        SettingsService service = mock(SettingsService.class);
        when(service.listMembers()).thenReturn(List.of(member("1", "Owner", "Owner")));
        MemberCreateRequest createRequest = new MemberCreateRequest();
        createRequest.setName("Workflow Operator");
        createRequest.setEmail("ops@aetherflow.mock");
        createRequest.setRole("Operator");
        when(service.createMember(createRequest)).thenReturn(member("2", "Workflow Operator", "Operator"));
        MemberUpdateRequest updateRequest = new MemberUpdateRequest();
        updateRequest.setRole("Admin");
        updateRequest.setStatus("active");
        when(service.updateMember(2L, updateRequest)).thenReturn(member("2", "Workflow Operator", "Admin"));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new SettingsController(service)).build();

        mockMvc.perform(get("/settings/members"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].role").value("Owner"));

        mockMvc.perform(post("/settings/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("2"))
                .andExpect(jsonPath("$.data.status").value("invited"));

        mockMvc.perform(patch("/settings/members/2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("Admin"));

        mockMvc.perform(delete("/settings/members/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        verify(service).deleteMember(2L);
    }

    @Test
    void returnsBillingAndAuditEvents() throws Exception {
        SettingsService service = mock(SettingsService.class);
        when(service.getBilling()).thenReturn(new BillingSnapshotResponse(
                "Team", 200, "$300", "$42.18", "2026-06-01", "3 / 10"
        ));
        when(service.listAuditEvents(20)).thenReturn(List.of(new AuditEventResponse(
                "audit-1", "02:34:20", "aether.operator",
                "updated model routing policy", "Summary and translate"
        )));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new SettingsController(service)).build();

        mockMvc.perform(get("/settings/billing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.aiCredits").value(200))
                .andExpect(jsonPath("$.data.seats").value("3 / 10"));

        mockMvc.perform(get("/settings/audit-events").param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].actor").value("aether.operator"));

        verify(service).listAuditEvents(20);
    }

    private static SettingsProfileResponse profile(String name) {
        return new SettingsProfileResponse(name, "aetherflow-lab", "cn-dev-01",
                "dev", 45, 30);
    }

    private static SettingsMemberResponse member(String id, String name, String role) {
        return new SettingsMemberResponse(id, name, name.toLowerCase() + "@aetherflow.mock",
                role, "invited", "pending");
    }
}
