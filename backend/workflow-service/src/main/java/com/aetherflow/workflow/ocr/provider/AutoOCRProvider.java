package com.aetherflow.workflow.ocr.provider;

// pattern: Imperative Shell
import com.aetherflow.workflow.document.DocumentContentExtractionService;
import com.aetherflow.workflow.document.DocumentExtractionResult;
import com.aetherflow.workflow.document.DocumentInput;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import org.springframework.stereotype.Component;

@Component
public class AutoOCRProvider implements OCRProvider {

    private final DocumentContentExtractionService documentContentExtractionService;

    public AutoOCRProvider(DocumentContentExtractionService documentContentExtractionService) {
        this.documentContentExtractionService = documentContentExtractionService;
    }

    @Override
    public String providerName() {
        return "auto";
    }

    @Override
    public OCRResult recognize(OCRRequest request) throws Exception {
        DocumentExtractionResult extracted = documentContentExtractionService.extract(new DocumentInput(
                request.file().fileName(), request.file().contentType(), request.file().content()
        ), request.config().language());
        return new OCRResult(
                extracted.text(), extracted.language(), extracted.confidence(), extracted.pageCount()
        );
    }
}
