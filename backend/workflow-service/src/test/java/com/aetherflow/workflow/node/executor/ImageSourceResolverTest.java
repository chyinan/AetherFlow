package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ImageSourceResolverTest {

    private static final byte[] IMAGE = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2lNwAAAAASUVORK5CYII=");
    private static final String BASE64 = Base64.getEncoder().encodeToString(IMAGE);

    private final FileMetadataClient fileClient = mock(FileMetadataClient.class);
    private final WorkflowNodeProperties properties = mock(WorkflowNodeProperties.class);
    private final ImageSourceResolver resolver = new ImageSourceResolver(fileClient, properties);
    private final DefaultWorkflowContext context = new DefaultWorkflowContext(
            "workflow-1", "trace-1", "task-1", Map.of("userId", 99L));

    @ParameterizedTest
    @ValueSource(strings = {"image/png", "image/jpeg", "image/webp"})
    void downloadsOnlyFirstStoredImageThroughExistingClient(String contentType) {
        storedImage(contentType, (long) IMAGE.length, IMAGE);

        Map<String, Object> result = resolver.resolve(Map.of("sourceImage", List.of(7L, 8L)), context, true);

        assertThat(result).containsEntry("sourceImage", BASE64)
                .containsEntry("sourceImageContentType", contentType);
        verify(fileClient).getMetadata("test-token", 99L, 7L);
        verify(fileClient).downloadFile("test-token", 99L, 7L);
        verify(fileClient, never()).getMetadata(anyString(), anyLong(), eq(8L));
        verify(fileClient, never()).downloadFile(anyString(), anyLong(), eq(8L));
    }

    @Test
    void acceptsSingleNumericFileIdAndStringUserId() {
        storedImage("image/png", (long) IMAGE.length, IMAGE);
        DefaultWorkflowContext stringUser = new DefaultWorkflowContext(
                "workflow-1", "trace-1", "task-1", Map.of("userId", "99"));

        assertThat(resolver.resolve(Map.of("sourceImage", 7), stringUser, true))
                .containsEntry("sourceImage", BASE64);
        verify(fileClient).downloadFile("test-token", 99L, 7L);
    }

    @Test
    void preservesPlainBase64AndNormalizesDataUrlsWithoutFileCalls() {
        assertThat(resolver.resolve(Map.of("sourceImage", BASE64), context, true))
                .containsEntry("sourceImage", BASE64).containsEntry("sourceImageContentType", "image/png");
        assertThat(resolver.resolve(Map.of("sourceImage", "data:image/webp;base64," + BASE64), context, true))
                .containsEntry("sourceImage", BASE64).containsEntry("sourceImageContentType", "image/webp");
        assertThat(resolver.resolve(Map.of("sourceImage", BASE64, "sourceImageContentType", "image/jpeg"), context, true))
                .containsEntry("sourceImageContentType", "image/jpeg");
        verifyNoInteractions(fileClient, properties);
    }

    @Test
    void infersJpegAndWebpForPlainBase64FromTheImagePicker() {
        String jpeg = Base64.getEncoder().encodeToString(new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0});
        String webp = Base64.getEncoder().encodeToString(new byte[]{'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P'});
        assertThat(resolver.resolve(Map.of("sourceImage", jpeg), context, true))
                .containsEntry("sourceImage", jpeg).containsEntry("sourceImageContentType", "image/jpeg");
        assertThat(resolver.resolve(Map.of("sourceImage", webp), context, true))
                .containsEntry("sourceImage", webp).containsEntry("sourceImageContentType", "image/webp");
        verifyNoInteractions(fileClient, properties);
    }

    @Test
    void allowsTextToImageWithoutSourceButRejectsRequiredMissingSource() {
        assertThat(resolver.resolve(Map.of("prompt", "photo"), context, false))
                .containsOnlyKeys("prompt");
        assertThatThrownBy(() -> resolver.resolve(Map.of(), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("源图片");
        verifyNoInteractions(fileClient);
    }

    @Test
    void textToImageDoesNotValidateOrDownloadUnrelatedLegacySource() {
        for (Object source : List.of("not-base64", List.of(), List.of(7L), 7, Map.of("legacy", "value"))) {
            Map<String, Object> payload = Map.of("sourceImage", source, "prompt", "photo");
            assertThat(resolver.resolve(payload, context, false)).isSameAs(payload);
        }
        verifyNoInteractions(fileClient, properties);
    }

    @Test
    void rejectsInvalidFileReferencesWithoutFileCalls() {
        for (Object source : List.of(List.of(), List.of("7"), List.of(Map.of("id", 7)),
                0, -1, new BigDecimal("7.1"), new BigDecimal("9223372036854775808"), Double.NaN, Map.of("id", 7))) {
            assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", source), context, true))
                    .isInstanceOf(BusinessException.class);
        }
        verifyNoInteractions(fileClient, properties);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "not-base64", "https://example.test/image.png", "/tmp/image.png",
            "data:image/svg+xml;base64,PHN2Zz4=", "data:text/plain;base64,aW1hZ2U=", "data:image/png,abc",
            "data:image/png;base64,"})
    void preservesLegacyStringsWithoutNewFormatRejectionOrFileAccess(String source) {
        String expected = "data:image/png;base64,".equals(source) ? "" : source;
        assertThat(resolver.resolve(Map.of("sourceImage", source), context, true))
                .containsEntry("sourceImage", expected);
        verifyNoInteractions(fileClient, properties);
    }

    @Test
    void preservesExplicitMimeForLegacyStringInput() {
        assertThat(resolver.resolve(
                Map.of("sourceImage", BASE64, "sourceImageContentType", "image/gif"), context, true))
                .containsEntry("sourceImage", BASE64).containsEntry("sourceImageContentType", "image/gif");
        verifyNoInteractions(fileClient);
    }

    @Test
    void preservesLegacyBase64AboveTheNewLocalPickerLimit() {
        String beyondPickerLimit = Base64.getEncoder().encodeToString(new byte[6 * 1024 * 1024]);
        assertThat(resolver.resolve(Map.of("sourceImage", beyondPickerLimit), context, true))
                .containsEntry("sourceImage", beyondPickerLimit);
        verifyNoInteractions(fileClient);
    }

    @ParameterizedTest
    @ValueSource(ints = {6 * 1024 * 1024, ImageSourceResolver.MAX_IMAGE_BYTES})
    void acceptsStoredImagesAboveFiveMiBUntilExistingArtifactLimit(int size) {
        byte[] bytes = new byte[size];
        storedImage("image/png", (long) size, bytes);

        Map<String, Object> result = resolver.resolve(Map.of("sourceImage", List.of(7L)), context, true);

        assertThat(Base64.getDecoder().decode((String) result.get("sourceImage"))).hasSize(size);
        verify(fileClient).downloadFile("test-token", 99L, 7L);
    }

    @Test
    void rejectsMissingUserBeforeCallingFileService() {
        DefaultWorkflowContext missingUser = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", Map.of());
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), missingUser, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("用户 ID");
        verifyNoInteractions(fileClient, properties);
    }

    @Test
    void requiresSuccessfulMetadataBeforeDownloading() {
        when(properties.issueFileInternalToken()).thenReturn("test-token");
        when(fileClient.getMetadata("test-token", 99L, 7L)).thenReturn(Result.fail(ResultCode.BAD_REQUEST));

        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("元数据");
        verify(fileClient, never()).downloadFile(anyString(), anyLong(), anyLong());
    }

    @Test
    void hidesMetadataClientExceptionDetails() {
        when(properties.issueFileInternalToken()).thenReturn("test-token");
        when(fileClient.getMetadata("test-token", 99L, 7L)).thenThrow(new IllegalStateException(
                "GET https://internal.example.test/metadata/7 body={private:metadata} token=test-secret"));

        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class)
                .hasMessage("[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:FAILED] 无法读取源图片元数据")
                .hasMessageNotContaining("https://")
                .hasMessageNotContaining("private:metadata")
                .hasMessageNotContaining("test-secret")
                .hasNoCause();
        verify(fileClient, never()).downloadFile(anyString(), anyLong(), anyLong());
    }

    @Test
    void hidesDownloadClientExceptionDetails() {
        storedImage("image/png", (long) IMAGE.length, IMAGE);
        when(fileClient.downloadFile("test-token", 99L, 7L)).thenThrow(new IllegalStateException(
                "GET https://internal.example.test/files/7/download body={private:image} token=test-secret"));

        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class)
                .hasMessage("[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:FAILED] 无法下载源图片")
                .hasMessageNotContaining("https://")
                .hasMessageNotContaining("private:image")
                .hasMessageNotContaining("test-secret")
                .hasNoCause();
    }

    @Test
    void rejectsInvalidDeclaredSizeAndMimeBeforeDownloading() {
        for (Long size : new Long[]{null, 0L, -1L, (long) ImageSourceResolver.MAX_IMAGE_BYTES + 1}) {
            storedImage("image/png", size, IMAGE);
            assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                    .isInstanceOf(BusinessException.class);
        }
        storedImage("image/svg+xml", (long) IMAGE.length, IMAGE);
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("PNG");
        verify(fileClient, never()).downloadFile(anyString(), anyLong(), anyLong());
    }

    @Test
    void rechecksDownloadedBytesAndMime() {
        storedImage("image/png", (long) IMAGE.length, new byte[0]);
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("不能为空");
        storedImage("image/png", (long) IMAGE.length, new byte[ImageSourceResolver.MAX_IMAGE_BYTES + 1]);
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("20 MiB");
        when(fileClient.downloadFile("test-token", 99L, 7L))
                .thenReturn(ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(IMAGE));
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("PNG");
        when(fileClient.downloadFile("test-token", 99L, 7L))
                .thenReturn(ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(IMAGE));
        assertThatThrownBy(() -> resolver.resolve(Map.of("sourceImage", 7), context, true))
                .isInstanceOf(BusinessException.class).hasMessageContaining("不一致");
    }

    private void storedImage(String contentType, Long declaredSize, byte[] downloaded) {
        when(properties.issueFileInternalToken()).thenReturn("test-token");
        when(fileClient.getMetadata("test-token", 99L, 7L)).thenReturn(Result.success(
                new FileMetadataDTO(7L, "images", "source.png", "source.png", contentType, declaredSize, null)));
        when(fileClient.downloadFile("test-token", 99L, 7L)).thenReturn(
                ResponseEntity.ok().contentType(MediaType.parseMediaType(contentType)).body(downloaded));
    }
}
