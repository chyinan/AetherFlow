package com.aetherflow.workflow.ocr.provider;

import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;

public interface OCRProvider {

    String providerName();

    OCRResult recognize(OCRRequest request) throws Exception;
}
