package com.aetherflow.file.config;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class SeataConfigurationContractTest {

    @Test
    void applicationConfigUsesAetherFlowSeataTransactionGroup() throws IOException {
        String yaml = readClasspathResource("application.yml");

        assertThat(yaml).contains("seata:");
        assertThat(yaml).contains("enabled: true");
        assertThat(yaml).contains("tx-service-group: aetherflow_tx_group");
        assertThat(yaml).contains("default: ${SEATA_ADDR:192.168.101.68:8091}");
    }

    @Test
    void productionConfigUsesContainerSeataAddress() throws IOException {
        String yaml = readClasspathResource("application-prod.yml");

        assertThat(yaml).contains("seata:");
        assertThat(yaml).contains("default: ${SEATA_ADDR:seata:8091}");
    }

    private static String readClasspathResource(String name) throws IOException {
        try (var input = SeataConfigurationContractTest.class.getClassLoader().getResourceAsStream(name)) {
            assertThat(input).as(name).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
