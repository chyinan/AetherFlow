package com.aetherflow.ai.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class WhisperEnvironmentControllerTest {
    @Test
    void forwardsReadonlyEnvironmentSnapshot() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://python-fixture");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://python-fixture/ai/whisper/environment"))
                .andRespond(withSuccess("""
                        {"status":"unloaded","enabled":true,"model":"small","device":"cpu",
                        "computeType":"int8","loadedModel":null,"dependencyAvailable":true,
                        "ffmpegAvailable":true,"detectedFrom":"backend","restartRequired":false,"message":"not loaded"}
                        """, MediaType.APPLICATION_JSON));
        var response = new WhisperEnvironmentController(builder.build()).status().getData();
        assertThat(response.status()).isEqualTo("unloaded");
        assertThat(response.model()).isEqualTo("small");
        server.verify();
    }

    @Test
    void unavailableRuntimeReturnsUnknownConfigurationWithoutLeakingUpstreamDetails() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://python-fixture");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://python-fixture/ai/whisper/environment"))
                .andRespond(withServerError().body("private upstream configuration"));
        var response = new WhisperEnvironmentController(builder.build()).status().getData();
        assertThat(response.status()).isEqualTo("unreachable");
        assertThat(response.model()).isEmpty();
        assertThat(response.message()).doesNotContain("private");
        server.verify();
    }
}
