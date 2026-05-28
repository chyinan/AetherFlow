package com.aetherflow.file.service.impl;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;

class FileHashServiceImplTest {

    @Test
    void sha256ShouldMatchKnownValue() {
        FileHashServiceImpl service = new FileHashServiceImpl();
        MockMultipartFile file = new MockMultipartFile("file", "demo.txt", "text/plain", "abc".getBytes());

        String hash = service.sha256(file);

        assertThat(hash).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
