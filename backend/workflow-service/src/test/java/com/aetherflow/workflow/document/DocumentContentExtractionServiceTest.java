package com.aetherflow.workflow.document;

import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.ocr.provider.TesseractOCRProvider;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentContentExtractionServiceTest {

    @Test
    void routesOfficeDocumentsToTikaWithoutInvokingNativeOcr() throws Exception {
        DocumentTextExtractionService textExtractor = mock(DocumentTextExtractionService.class);
        TesseractOCRProvider tesseract = mock(TesseractOCRProvider.class);
        DocumentInput input = input("runbook.docx", "application/docx");
        when(textExtractor.extract(input)).thenReturn(new DocumentExtractionResult("runbook", "application/docx", 1));
        DocumentContentExtractionService service = new DocumentContentExtractionService(
                textExtractor, tesseract, new OCRProperties());

        DocumentExtractionResult result = service.extract(input, "auto");

        assertThat(result.text()).isEqualTo("runbook");
        verify(tesseract, never()).recognize(any(OCRRequest.class));
    }

    @Test
    void fallsBackToTesseractWhenPdfHasNoTextLayer() throws Exception {
        DocumentTextExtractionService textExtractor = mock(DocumentTextExtractionService.class);
        TesseractOCRProvider tesseract = mock(TesseractOCRProvider.class);
        DocumentInput input = input("scan.pdf", "application/pdf");
        when(textExtractor.extract(input)).thenReturn(new DocumentExtractionResult("", "application/pdf", 0));
        when(tesseract.supports(any(OCRInputFile.class))).thenReturn(true);
        when(tesseract.recognize(any(OCRRequest.class))).thenReturn(new OCRResult("scanned text", "eng", 0.87, 2));
        DocumentContentExtractionService service = new DocumentContentExtractionService(
                textExtractor, tesseract, new OCRProperties());

        DocumentExtractionResult result = service.extract(input, "eng");

        assertThat(result.text()).isEqualTo("scanned text");
        assertThat(result.confidence()).isEqualTo(0.87);
        assertThat(result.pageCount()).isEqualTo(2);
    }

    @Test
    void sendsImagesDirectlyToTesseract() throws Exception {
        DocumentTextExtractionService textExtractor = mock(DocumentTextExtractionService.class);
        TesseractOCRProvider tesseract = mock(TesseractOCRProvider.class);
        DocumentInput input = input("receipt.png", "image/png");
        when(tesseract.recognize(any(OCRRequest.class))).thenReturn(new OCRResult("receipt", "eng", 0.9, 1));
        DocumentContentExtractionService service = new DocumentContentExtractionService(
                textExtractor, tesseract, new OCRProperties());

        DocumentExtractionResult result = service.extract(input, "eng");

        assertThat(result.text()).isEqualTo("receipt");
        verify(textExtractor, never()).extract(any(DocumentInput.class));
    }

    @Test
    void rejectsOversizedImagesBeforeInvokingNativeOcr() {
        DocumentTextExtractionService textExtractor = mock(DocumentTextExtractionService.class);
        TesseractOCRProvider tesseract = mock(TesseractOCRProvider.class);
        DocumentExtractionProperties properties = new DocumentExtractionProperties();
        properties.setMaxFileBytes(4);
        DocumentContentExtractionService service = new DocumentContentExtractionService(
                textExtractor, tesseract, new OCRProperties(), properties);

        assertThatThrownBy(() -> service.extract(
                new DocumentInput("receipt.png", "image/png", new byte[5]), "eng"))
                .hasMessageContaining("document file size exceeds");
        try {
            verify(tesseract, never()).recognize(any(OCRRequest.class));
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private DocumentInput input(String fileName, String contentType) {
        return new DocumentInput(fileName, contentType, "content".getBytes(StandardCharsets.UTF_8));
    }
}
