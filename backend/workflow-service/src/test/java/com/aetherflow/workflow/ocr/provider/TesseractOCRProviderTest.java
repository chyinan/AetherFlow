package com.aetherflow.workflow.ocr.provider;

import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TesseractOCRProviderTest {

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
