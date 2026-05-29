package com.aetherflow.workflow.ocr.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

@Component
public class TesseractOCRProvider implements OCRProvider {

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "pdf");

    private final OCRProperties properties;

    public TesseractOCRProvider(OCRProperties properties) {
        this.properties = properties;
    }

    @Override
    public String providerName() {
        return "tesseract";
    }

    @Override
    public OCRResult recognize(OCRRequest request) throws IOException {
        OCRInputFile file = request.file();
        OCRNodeConfig config = request.config();
        String extension = extension(file);
        if (!SUPPORTED_EXTENSIONS.contains(extension)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported OCR file type");
        }
        if ("pdf".equals(extension)) {
            OCRResult textLayerResult = extractPdfTextLayer(file, config);
            if (textLayerResult != null) {
                return textLayerResult;
            }
        }
        Path tempFile = Files.createTempFile("aetherflow-ocr-", "." + extension);
        try {
            Files.write(tempFile, file.content());
            ITesseract tesseract = buildTesseract(config);
            String text = tesseract.doOCR(tempFile.toFile());
            return new OCRResult(
                    text == null ? "" : text.strip(),
                    language(config),
                    text == null || text.isBlank() ? 0.0 : 1.0,
                    pageCount(file, extension)
            );
        } catch (TesseractException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "tesseract OCR failed");
        } finally {
            Files.deleteIfExists(tempFile);
        }
    }

    private OCRResult extractPdfTextLayer(OCRInputFile file, OCRNodeConfig config) throws IOException {
        try (PDDocument document = Loader.loadPDF(file.content())) {
            String text = new PDFTextStripper().getText(document);
            if (!StringUtils.hasText(text)) {
                return null;
            }
            return new OCRResult(
                    text.strip(),
                    language(config),
                    1.0,
                    document.getNumberOfPages()
            );
        }
    }

    private int pageCount(OCRInputFile file, String extension) {
        if (!"pdf".equals(extension)) {
            return 1;
        }
        try (PDDocument document = Loader.loadPDF(file.content())) {
            return Math.max(document.getNumberOfPages(), 1);
        } catch (IOException exception) {
            return 1;
        }
    }

    private ITesseract buildTesseract(OCRNodeConfig config) {
        Tesseract tesseract = new Tesseract();
        if (StringUtils.hasText(properties.getTesseract().getDataPath())) {
            tesseract.setDatapath(properties.getTesseract().getDataPath());
        }
        tesseract.setLanguage(language(config));
        return tesseract;
    }

    private String language(OCRNodeConfig config) {
        if (config.language() == null || config.language().isBlank() || "auto".equalsIgnoreCase(config.language())) {
            return properties.getTesseract().getFallbackLanguage();
        }
        return config.language();
    }

    private String extension(OCRInputFile file) {
        String fromName = extensionFromName(file.fileName());
        if (!fromName.isBlank()) {
            return fromName;
        }
        return switch (file.contentType().toLowerCase(Locale.ROOT)) {
            case "image/png" -> "png";
            case "image/jpeg", "image/jpg" -> "jpg";
            case "application/pdf" -> "pdf";
            default -> "";
        };
    }

    private String extensionFromName(String fileName) {
        if (fileName == null) {
            return "";
        }
        int index = fileName.lastIndexOf('.');
        if (index < 0 || index == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(index + 1).toLowerCase(Locale.ROOT);
    }
}
