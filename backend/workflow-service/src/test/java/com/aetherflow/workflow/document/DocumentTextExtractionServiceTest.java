package com.aetherflow.workflow.document;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentTextExtractionServiceTest {

    @Test
    void extractsTextFromDocxWithTheStandardParserPackage() throws Exception {
        DocumentExtractionProperties properties = new DocumentExtractionProperties();
        DocumentTextExtractionService service = new DocumentTextExtractionService(properties);

        DocumentExtractionResult result = service.extract(new DocumentInput(
                "operations-runbook.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                minimalDocx("Production recovery checklist")
        ));

        assertThat(result.text()).contains("Production recovery checklist");
        assertThat(result.detectedContentType()).contains("officedocument");
        assertThat(service.supportedExtensions()).contains("doc", "docx", "xls", "xlsx", "ppt", "pptx",
                "pdf", "msg", "eml", "epub", "md", "html", "csv", "txt");
    }

    @Test
    void rejectsUnknownFormatsBeforeInvokingAParser() {
        DocumentTextExtractionService service = new DocumentTextExtractionService(new DocumentExtractionProperties());

        assertThatThrownBy(() -> service.extract(new DocumentInput(
                "payload.exe", "application/octet-stream", new byte[]{1, 2, 3}
        ))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported document file type");
    }

    @Test
    void enforcesInputAndExtractedTextLimits() {
        DocumentExtractionProperties properties = new DocumentExtractionProperties();
        properties.setMaxFileBytes(32);
        properties.setMaxExtractedCharacters(16);
        DocumentTextExtractionService service = new DocumentTextExtractionService(properties);

        assertThatThrownBy(() -> service.extract(new DocumentInput(
                "oversized.txt", "text/plain", "x".repeat(33).getBytes(StandardCharsets.UTF_8)
        ))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("document file size exceeds");

        assertThatThrownBy(() -> service.extract(new DocumentInput(
                "too-much-text.txt", "text/plain", "x".repeat(17).getBytes(StandardCharsets.UTF_8)
        ))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("extracted document text exceeds");
    }

    @Test
    void extractsThePrimaryBodyFromEmailWithoutEmbeddedAttachments() {
        DocumentTextExtractionService service = new DocumentTextExtractionService(new DocumentExtractionProperties());
        String email = """
                From: operations@example.test
                To: oncall@example.test
                Subject: Recovery procedure
                MIME-Version: 1.0
                Content-Type: text/plain; charset=UTF-8

                Restart the workflow worker after draining the queue.
                """;

        DocumentExtractionResult result = service.extract(new DocumentInput(
                "recovery.eml", "message/rfc822", email.getBytes(StandardCharsets.UTF_8)));

        assertThat(result.text()).contains("Restart the workflow worker after draining the queue.");
    }

    @Test
    void keepsEmailAttachmentsOutOfTheExtractedKnowledgeText() {
        DocumentTextExtractionService service = new DocumentTextExtractionService(new DocumentExtractionProperties());
        String email = """
                From: operations@example.test
                To: oncall@example.test
                Subject: Recovery procedure
                MIME-Version: 1.0
                Content-Type: multipart/mixed; boundary="aetherflow-boundary"

                --aetherflow-boundary
                Content-Type: text/plain; charset=UTF-8

                Visible recovery instructions.
                --aetherflow-boundary
                Content-Type: text/plain; name="secret.txt"
                Content-Disposition: attachment; filename="secret.txt"

                ATTACHMENT_SECRET_MUST_NOT_BE_INDEXED
                --aetherflow-boundary--
                """;

        DocumentExtractionResult result = service.extract(new DocumentInput(
                "recovery.eml", "message/rfc822", email.getBytes(StandardCharsets.UTF_8)));

        assertThat(result.text()).contains("Visible recovery instructions.")
                .doesNotContain("ATTACHMENT_SECRET_MUST_NOT_BE_INDEXED");
    }

    @Test
    void extractsTextFromEpubPackage() throws Exception {
        DocumentTextExtractionService service = new DocumentTextExtractionService(new DocumentExtractionProperties());

        DocumentExtractionResult result = service.extract(new DocumentInput(
                "runbook.epub", "application/epub+zip", minimalEpub("Queue recovery chapter")));

        assertThat(result.text()).contains("Queue recovery chapter");
    }

    private byte[] minimalDocx(String text) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            entry(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                    </Types>
                    """);
            entry(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                    </Relationships>
                    """);
            entry(zip, "word/document.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:body>
                    </w:document>
                    """.formatted(text));
        }
        return output.toByteArray();
    }

    private byte[] minimalEpub(String text) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            entry(zip, "mimetype", "application/epub+zip");
            entry(zip, "META-INF/container.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
                    </container>
                    """);
            entry(zip, "OEBPS/content.opf", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
                      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">runbook</dc:identifier><dc:title>Runbook</dc:title><dc:language>en</dc:language></metadata>
                      <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
                      <spine><itemref idref="chapter"/></spine>
                    </package>
                    """);
            entry(zip, "OEBPS/chapter.xhtml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Runbook</title></head><body><p>%s</p></body></html>
                    """.formatted(text));
        }
        return output.toByteArray();
    }

    private void entry(ZipOutputStream zip, String name, String content) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
