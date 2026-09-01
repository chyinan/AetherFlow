package com.aetherflow.workflow.document;

// pattern: Imperative Shell
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.ocr.provider.TesseractOCRProvider;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

@Service
public class DocumentContentExtractionService {

    private final DocumentTextExtractionService textExtractionService;
    private final TesseractOCRProvider tesseractOCRProvider;
    private final OCRProperties ocrProperties;
    private final DocumentExtractionProperties extractionProperties;

    public DocumentContentExtractionService(DocumentTextExtractionService textExtractionService,
                                            TesseractOCRProvider tesseractOCRProvider,
                                            OCRProperties ocrProperties) {
        this(textExtractionService, tesseractOCRProvider, ocrProperties, new DocumentExtractionProperties());
    }

    @Autowired
    public DocumentContentExtractionService(DocumentTextExtractionService textExtractionService,
                                            TesseractOCRProvider tesseractOCRProvider,
                                            OCRProperties ocrProperties,
                                            DocumentExtractionProperties extractionProperties) {
        this.textExtractionService = textExtractionService;
        this.tesseractOCRProvider = tesseractOCRProvider;
        this.ocrProperties = ocrProperties;
        this.extractionProperties = extractionProperties;
    }

    public DocumentExtractionResult extract(DocumentInput input, String language) throws Exception {
        validate(input);
        OCRInputFile ocrFile = new OCRInputFile(input.fileName(), input.contentType(), input.content());
        if (DocumentFormatPolicy.supportsImageOcr(input.fileName(), input.contentType())) {
            ensureOcrReady(language);
            return fromOcr(tesseractOCRProvider.recognize(ocrRequest(ocrFile, language)), input.contentType());
        }

        DocumentExtractionResult textResult = textExtractionService.extract(input);
        if (!textResult.text().isBlank() || !tesseractOCRProvider.supports(ocrFile)) {
            return textResult;
        }
        ensureOcrReady(language);
        return fromOcr(tesseractOCRProvider.recognize(ocrRequest(ocrFile, language)), input.contentType());
    }

    private void validate(DocumentInput input) {
        if (input == null || input.size() == 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "document file is empty");
        }
        if (input.size() > extractionProperties.getMaxFileBytes()) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "document file size exceeds " + extractionProperties.getMaxFileBytes() + " bytes");
        }
        if (!DocumentFormatPolicy.supportsDocument(input.fileName(), input.contentType())
                && !DocumentFormatPolicy.supportsImageOcr(input.fileName(), input.contentType())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported document file type");
        }
    }

    private OCRRequest ocrRequest(OCRInputFile input, String language) {
        OCRNodeConfig config = OCRNodeConfig.from(Map.of(
                "language", language == null || language.isBlank() ? "auto" : language
        ), ocrProperties);
        return new OCRRequest(input, config);
    }

    private void ensureOcrReady(String language) {
        if (!tesseractOCRProvider.isReady(language)) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "tesseract OCR provider is not ready for language " + (language == null ? "auto" : language));
        }
    }

    private DocumentExtractionResult fromOcr(OCRResult result, String contentType) {
        return new DocumentExtractionResult(
                result.text(), contentType, result.pageCount(), result.language(), result.confidence()
        );
    }
}
