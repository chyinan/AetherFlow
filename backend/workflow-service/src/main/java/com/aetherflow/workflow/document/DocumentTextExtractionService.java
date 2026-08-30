package com.aetherflow.workflow.document;

// pattern: Imperative Shell
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.apache.tika.exception.TikaException;
import org.apache.tika.exception.WriteLimitReachedException;
import org.apache.tika.extractor.EmbeddedDocumentExtractor;
import org.apache.tika.metadata.HttpHeaders;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.metadata.TikaCoreProperties;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.Parser;
import org.apache.tika.detect.Detector;
import org.apache.tika.parser.pdf.PDFParserConfig;
import org.apache.tika.sax.BodyContentHandler;
import org.apache.tika.sax.WriteOutContentHandler;
import org.springframework.stereotype.Service;
import org.xml.sax.ContentHandler;
import org.xml.sax.SAXException;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Service
public class DocumentTextExtractionService {

    private final DocumentExtractionProperties properties;

    public DocumentTextExtractionService(DocumentExtractionProperties properties) {
        this.properties = properties;
    }

    public List<String> supportedExtensions() {
        return DocumentFormatPolicy.DOCUMENT_EXTENSIONS;
    }

    public DocumentExtractionResult extract(DocumentInput input) {
        validate(input);
        Metadata metadata = new Metadata();
        metadata.set(TikaCoreProperties.RESOURCE_NAME_KEY, input.fileName());
        metadata.set(HttpHeaders.CONTENT_TYPE, input.contentType());
        WriteOutContentHandler writeLimitHandler = new WriteOutContentHandler(properties.getMaxExtractedCharacters());
        BodyContentHandler bodyHandler = new BodyContentHandler(writeLimitHandler);
        AutoDetectParser parser = new AutoDetectParser();
        ParseContext context = safeParseContext(parser);
        try (InputStream stream = input.openStream()) {
            parser.parse(stream, bodyHandler, metadata, context);
        } catch (SAXException exception) {
            if (WriteLimitReachedException.isWriteLimitReached(exception)) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                        "extracted document text exceeds " + properties.getMaxExtractedCharacters() + " characters");
            }
            throw invalidDocument(exception);
        } catch (TikaException | IOException exception) {
            throw invalidDocument(exception);
        }
        String text = writeLimitHandler.toString().strip();
        return new DocumentExtractionResult(text, detectedContentType(metadata, input), pageCount(metadata, text));
    }

    private void validate(DocumentInput input) {
        if (input == null || input.size() == 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "document file is empty");
        }
        if (!DocumentFormatPolicy.supportsDocument(input.fileName(), input.contentType())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported document file type");
        }
        if (input.size() > properties.getMaxFileBytes()) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "document file size exceeds " + properties.getMaxFileBytes() + " bytes");
        }
    }

    private ParseContext safeParseContext(AutoDetectParser parser) {
        ParseContext context = new ParseContext();
        context.set(Parser.class, parser);
        context.set(Detector.class, parser.getDetector());
        PDFParserConfig pdfConfig = new PDFParserConfig();
        pdfConfig.setOcrStrategy(PDFParserConfig.OCR_STRATEGY.NO_OCR);
        pdfConfig.setExtractInlineImages(false);
        pdfConfig.setParseIncrementalUpdates(false);
        pdfConfig.setMaxMainMemoryBytes(properties.getMaxFileBytes());
        context.set(PDFParserConfig.class, pdfConfig);
        context.set(EmbeddedDocumentExtractor.class, new EmbeddedDocumentExtractor() {
            @Override
            public boolean shouldParseEmbedded(Metadata metadata) {
                return false;
            }

            @Override
            public void parseEmbedded(InputStream stream,
                                      ContentHandler handler,
                                      Metadata metadata,
                                      boolean outputHtml) {
                // Embedded attachments are intentionally excluded to bound parser work and avoid hidden payload ingestion.
            }
        });
        return context;
    }

    private String detectedContentType(Metadata metadata, DocumentInput input) {
        String detected = metadata.get(HttpHeaders.CONTENT_TYPE);
        return detected == null || detected.isBlank() ? input.contentType() : detected;
    }

    private int pageCount(Metadata metadata, String text) {
        for (String key : List.of("xmpTPg:NPages", "Page-Count", "meta:page-count")) {
            String value = metadata.get(key);
            if (value == null) {
                continue;
            }
            try {
                return Math.max(Integer.parseInt(value.trim()), 1);
            } catch (NumberFormatException ignored) {
                // Continue with other metadata aliases before using the deterministic fallback.
            }
        }
        return text.isBlank() ? 0 : 1;
    }

    private BusinessException invalidDocument(Exception exception) {
        return new BusinessException(ResultCode.BAD_REQUEST,
                "document parsing failed: " + exception.getClass().getSimpleName());
    }
}
