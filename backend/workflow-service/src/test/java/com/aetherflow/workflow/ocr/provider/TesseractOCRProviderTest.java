package com.aetherflow.workflow.ocr.provider;

// pattern: Imperative Shell

import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.document.DocumentExtractionProperties;
import com.aetherflow.common.exception.BusinessException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TesseractOCRProviderTest {

    @Test
    void reportsReadinessOnlyWhenAllRequestedLanguageModelsExist(@TempDir Path tessdata) throws Exception {
        OCRProperties properties = new OCRProperties();
        properties.getTesseract().setDataPath(tessdata.toString());
        TesseractOCRProvider provider = new TesseractOCRProvider(properties);

        assertThat(provider.isReady("eng+chi_sim")).isFalse();
        Files.createFile(tessdata.resolve("eng.traineddata"));
        Files.createFile(tessdata.resolve("chi_sim.traineddata"));

        assertThat(provider.isReady("eng+chi_sim")).isTrue();
    }

    @Test
    void extractsTextLayerFromPdfWithoutNativeTesseract() throws Exception {
        OCRProperties properties = new OCRProperties();
        TesseractOCRProvider provider = new TesseractOCRProvider(properties);
        byte[] pdf = pdfWithText("Invoice total 100");

        OCRResult result = provider.recognize(new OCRRequest(
                new OCRInputFile("invoice.pdf", "application/pdf", pdf),
                OCRNodeConfig.from(Map.of("language", "eng"), properties)
        ));

        assertThat(result.text()).contains("Invoice total 100");
        assertThat(result.language()).isEqualTo("eng");
        assertThat(result.confidence()).isEqualTo(1.0);
        assertThat(result.pageCount()).isEqualTo(1);
    }

    @Test
    void rejectsOversizedInputWhenTesseractIsSelectedExplicitly() {
        OCRProperties ocrProperties = new OCRProperties();
        DocumentExtractionProperties extractionProperties = new DocumentExtractionProperties();
        extractionProperties.setMaxFileBytes(4);
        TesseractOCRProvider provider = new TesseractOCRProvider(ocrProperties, extractionProperties);

        assertThatThrownBy(() -> provider.recognize(new OCRRequest(
                new OCRInputFile("receipt.png", "image/png", new byte[5]),
                OCRNodeConfig.from(Map.of("language", "eng"), ocrProperties)
        ))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("document file size exceeds");
    }

    private byte[] pdfWithText(String text) throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(100, 700);
                content.showText(text);
                content.endText();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }
}
