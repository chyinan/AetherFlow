package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.dto.NodeConnectionValidationRequest;
import com.aetherflow.common.dto.NodeConnectionValidationRequest.NodeSelection;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NodeConnectionServiceTest {
    private final NodeConnectionRepository repository = mock(NodeConnectionRepository.class);
    private final ImageConnectionDiscovery discovery = mock(ImageConnectionDiscovery.class);
    private final NodeConnectionProviderFactory factory = mock(NodeConnectionProviderFactory.class);
    private final ImageProviderProperties properties = new ImageProviderProperties();
    private final NodeConnectionService service = new NodeConnectionService(repository, discovery, factory, properties);
    private final NodeConnectionProfile saved = new NodeConnectionProfile("saved", "已有连接", "COMFYUI", "http://fake-comfy", false);

    @Test
    void probeDoesNotPersistAndSaveIsTheOnlyWrite() {
        when(discovery.probe(any(), isNull(), isNull())).thenReturn(usable());
        service.probe("COMFYUI", "http://fake-comfy/", null, null);
        verifyNoInteractions(repository);

        NodeConnectionProfile created = service.save(7L, null, new NodeConnectionRequest(" 新连接 ", "COMFYUI", "http://fake-comfy/"));

        assertThat(created.name()).isEqualTo("新连接");
        assertThat(created.baseUrl()).isEqualTo("http://fake-comfy");
        assertThat(created.readOnly()).isFalse();
        verify(repository).save(7L, created);
    }

    @Test
    void failedEditNeverReplacesOldProfile() {
        when(repository.find(7L, "saved")).thenReturn(saved);
        when(discovery.probe(any(), isNull(), isNull())).thenReturn(NodeConnectionProbe.unavailable("unreachable", "未连接"));

        assertThatThrownBy(() -> service.save(7L, "saved", new NodeConnectionRequest("修改连接", "COMFYUI", "http://fake-offline")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("未保存");
        verify(repository, never()).save(any(), any());
    }

    @Test
    void disabledDeploymentDefaultsStayReadOnlyAndUnconfigured() {
        when(repository.list(7L)).thenReturn(List.of(saved));
        assertThat(service.list(7L)).filteredOn(NodeConnectionProfile::readOnly).hasSize(2);
        assertThat(service.probe(7L, "deployment-comfyui", null, "IMAGE_GENERATION").status()).isEqualTo("unconfigured");
        assertThatThrownBy(() -> service.save(7L, "deployment-comfyui", new NodeConnectionRequest("x", "COMFYUI", "http://fake")))
                .hasMessageContaining("只读");
        verifyNoInteractions(discovery, factory);
    }

    @Test
    void deploymentListOmitsCredentialBearingAddressesAndPreservesValidDefaults() {
        when(repository.list(7L)).thenReturn(List.of());
        properties.getStableDiffusion().setBaseUrl("https://valid-sd.example:8443/backend/");
        properties.getComfy().setEnabled(true);
        for (String invalid : List.of("http://fixture-user:fixture-pass@fake-comfy:8188",
                "http://fake-comfy:8188?token=fixture-secret", "http://fake-comfy:8188#fixture-secret")) {
            properties.getComfy().setBaseUrl(invalid);
            List<NodeConnectionProfile> profiles = service.list(7L);
            assertThat(profiles).filteredOn(profile -> profile.id().equals("deployment-comfyui"))
                    .singleElement().extracting(NodeConnectionProfile::baseUrl).isEqualTo("");
            assertThat(profiles).filteredOn(profile -> profile.id().equals("deployment-sd"))
                    .singleElement().extracting(NodeConnectionProfile::baseUrl).isEqualTo("https://valid-sd.example:8443/backend");
            assertThat(profiles.toString()).doesNotContain("fixture-user", "fixture-pass", "fixture-secret");
            assertThat(service.probe(7L, "deployment-comfyui", null, "IMAGE_GENERATION").status()).isEqualTo("unconfigured");
            assertThatThrownBy(() -> service.resolveForExecution(7L, selection("deployment-comfyui")))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("不能包含");
        }
        verifyNoInteractions(discovery, factory);
    }

    @Test
    void missingExplicitConnectionIsAViolationAndNeverFallsBack() {
        var result = service.validate(new NodeConnectionValidationRequest(7L, List.of(selection("missing"))));
        assertThat(result.violations()).singleElement().asString().contains("连接不存在");
        verifyNoInteractions(discovery, factory);
    }

    @Test
    void selectedOptionsAreValidatedAgainstSuccessfulCatalogs() {
        when(repository.find(7L, "saved")).thenReturn(saved);
        when(discovery.probe(saved, null, null)).thenReturn(usable());
        NodeSelection selection = new NodeSelection("node", "IMAGE_GENERATION", "saved", "COMFYUI", "base.safetensors", null,
                null, "unknown-sampler", null, List.of());
        assertThat(service.validate(new NodeConnectionValidationRequest(7L, List.of(selection))).violations())
                .singleElement().asString().contains("samplers").contains("不在服务目录");
        verifyNoInteractions(factory);
    }

    @Test
    void unavailableSelectedCatalogIsUnknownAndFailsClosed() {
        when(repository.find(7L, "saved")).thenReturn(saved);
        when(discovery.probe(saved, null, null)).thenReturn(new NodeConnectionProbe(
                "usable", "已连接", "backend", usable().models(), usable().capabilities(), List.of(), List.of("checkpoints")));
        assertThat(service.validate(new NodeConnectionValidationRequest(7L, List.of(selection("saved")))).violations())
                .singleElement().asString().contains("无法验证").doesNotContain("模型缺失");
    }

    @Test
    void savedProfileResolvesTheExecutionProvider() {
        when(repository.find(7L, "saved")).thenReturn(saved);
        when(discovery.probe(saved, null, null)).thenReturn(usable());
        service.resolveForExecution(7L, selection("saved"));
        verify(factory).create(saved);
    }

    @Test
    void rejectsCredentialOrUnboundedEndpointForms() {
        for (String endpoint : List.of("ftp://host", "http://user:secret@host", "http://host?token=secret",
                "http://host#secret", "http://host:70000", "http://host:0", "http://", "https://" + "a".repeat(2048))) {
            assertThatThrownBy(() -> NodeConnectionService.endpoint(endpoint)).isInstanceOf(BusinessException.class);
        }
        assertThat(NodeConnectionService.endpoint("https://host:8443/comfy/")).isEqualTo("https://host:8443/comfy");
    }

    @Test
    void reusesOneProbePerConnectionWithinValidationAndChecksEachSelection() {
        when(repository.find(7L, "saved")).thenReturn(saved);
        when(discovery.probe(saved, null, null)).thenReturn(usable());
        NodeSelection missingModel = new NodeSelection("second", "IMAGE_GENERATION", "saved", "COMFYUI", "missing.ckpt", null);
        var response = service.validate(new NodeConnectionValidationRequest(7L, List.of(selection("saved"), missingModel)));
        assertThat(response.violations()).singleElement().asString().contains("second").contains("不在服务目录");
        verify(discovery).probe(saved, null, null);
        verify(repository).find(7L, "saved");
    }

    private NodeSelection selection(String id) {
        return new NodeSelection("node", "IMAGE_GENERATION", id, "COMFYUI", "base.safetensors", null);
    }

    private NodeConnectionProbe usable() {
        return new NodeConnectionProbe("usable", "已连接", "backend", new NodeConnectionProbe.Models(
                List.of("base.safetensors"), List.of(), List.of(), List.of("euler"), List.of("normal"), List.of("bilinear")),
                List.of("IMAGE_GENERATION", "UPSCALE"), List.of(), List.of());
    }
}
