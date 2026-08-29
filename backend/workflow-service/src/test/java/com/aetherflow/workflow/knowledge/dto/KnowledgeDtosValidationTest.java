package com.aetherflow.workflow.knowledge.dto;

import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeDtosValidationTest {

    private static final ValidatorFactory VALIDATOR_FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    void acceptsDocumentResourceBoundaryValues() {
        DocumentCreateRequest minimum = request("content", 64, 0);
        DocumentCreateRequest maximum = request("content", 16_384, 4_096);

        assertThat(VALIDATOR.validate(minimum)).isEmpty();
        assertThat(VALIDATOR.validate(maximum)).isEmpty();
    }

    @Test
    void rejectsChunkSizeOutsideDtoBoundaries() {
        assertThat(propertiesFor(request("content", 63, 0))).contains("chunkSize");
        assertThat(propertiesFor(request("content", 16_385, 0))).contains("chunkSize");
    }

    @Test
    void rejectsOverlapOutsideDtoBoundaries() {
        assertThat(propertiesFor(request("content", 1024, -1))).contains("overlap");
        assertThat(propertiesFor(request("content", 8192, 4_097))).contains("overlap");
    }

    @Test
    void rejectsBlankOrOversizedDocumentContentAtDtoBoundary() {
        assertThat(propertiesFor(request("   ", 1024, 50))).contains("content");
        assertThat(propertiesFor(request("a".repeat(1_000_001), 1024, 50))).contains("content");
    }

    private static DocumentCreateRequest request(String content, int chunkSize, int overlap) {
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setContent(content);
        request.setChunkSize(chunkSize);
        request.setOverlap(overlap);
        return request;
    }

    private static Set<String> propertiesFor(DocumentCreateRequest request) {
        return VALIDATOR.validate(request).stream()
                .map(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .collect(java.util.stream.Collectors.toSet());
    }
}
