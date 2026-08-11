package com.aetherflow.workflow.embedding.store;

import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigRequest;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigResponse;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VectorStoreConfigServiceTest {

    @Mock
    private VectorStoreConfigMapper mapper;

    private VectorStoreConfigService service;

    @BeforeEach
    void setUp() {
        EmbeddingProperties properties = new EmbeddingProperties();
        properties.setQdrantBaseUrl("http://localhost:6333");
        properties.setQdrantApiKey("");
        properties.setDefaultVectorCollection("workflow-embeddings");
        properties.setTimeout(Duration.ofSeconds(1));
        service = new VectorStoreConfigService(properties, mapper);
    }

    @Test
    void loadsPersistedConfigurationAfterServiceConstruction() {
        VectorStoreConfigEntity entity = entity("persisted-secret");
        when(mapper.selectById(1L)).thenReturn(entity);

        VectorStoreStoreConfigAssertions.assertConfig(service.currentConfig(), entity);

        verify(mapper).selectById(1L);
    }

    @Test
    void updatePersistsConfigurationAndKeepsExistingSecretWhenApiKeyIsOmitted() {
        VectorStoreConfigEntity existing = entity("persisted-secret");
        when(mapper.selectById(1L)).thenReturn(existing);
        VectorStoreConfigRequest request = new VectorStoreConfigRequest();
        request.setEnabled(true);
        request.setProvider("qdrant");
        request.setBaseUrl("https://qdrant.example.com/");
        request.setCollection("production-embeddings");
        request.setApiKey(null);

        VectorStoreConfigResponse response = service.update(request);

        ArgumentCaptor<VectorStoreConfigEntity> captor = ArgumentCaptor.forClass(VectorStoreConfigEntity.class);
        verify(mapper).updateById(captor.capture());
        VectorStoreConfigEntity saved = captor.getValue();
        assertThat(saved.getApiKey()).isEqualTo("persisted-secret");
        assertThat(saved.getBaseUrl()).isEqualTo("https://qdrant.example.com");
        assertThat(saved.getCollection()).isEqualTo("production-embeddings");
        assertThat(response.apiKeyConfigured()).isTrue();
    }

    @Test
    void rejectsVectorStoreAddressesThatResolveToLoopbackOrPrivateNetworks() {
        VectorStoreConfigRequest request = new VectorStoreConfigRequest();
        request.setEnabled(true);
        request.setProvider("qdrant");
        request.setBaseUrl("http://127.0.0.1:6333");
        request.setCollection("production-embeddings");

        assertThatThrownBy(() -> service.update(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("private network");
    }

    private static VectorStoreConfigEntity entity(String apiKey) {
        VectorStoreConfigEntity entity = new VectorStoreConfigEntity();
        entity.setId(1L);
        entity.setProvider("qdrant");
        entity.setEnabled(true);
        entity.setBaseUrl("http://persisted-qdrant:6333");
        entity.setApiKey(apiKey);
        entity.setCollection("persisted-embeddings");
        return entity;
    }

    private static final class VectorStoreStoreConfigAssertions {

        private VectorStoreStoreConfigAssertions() {
        }

        private static void assertConfig(VectorStoreConfigService.VectorStoreRuntimeConfig actual,
                                         VectorStoreConfigEntity expected) {
            assertThat(actual.provider()).isEqualTo(expected.getProvider());
            assertThat(actual.enabled()).isEqualTo(expected.getEnabled());
            assertThat(actual.baseUrl()).isEqualTo(expected.getBaseUrl());
            assertThat(actual.apiKey()).isEqualTo(expected.getApiKey());
            assertThat(actual.collection()).isEqualTo(expected.getCollection());
        }
    }
}
