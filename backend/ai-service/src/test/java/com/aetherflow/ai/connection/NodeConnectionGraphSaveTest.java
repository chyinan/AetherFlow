package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class NodeConnectionGraphSaveTest {
    @Test void draftAndSavedControllerRequestsRetainActualWorkflowTypes() throws Exception {
        var service=mock(NodeConnectionService.class);
        var controller=new com.aetherflow.ai.controller.NodeConnectionController(service);
        var request=new ObjectMapper().readValue("{\"provider\":\"COMFYUI\",\"baseUrl\":\"http://fake-comfy\",\"workflowNodeTypes\":[\"PluginCustom\"]}",com.aetherflow.ai.controller.NodeConnectionController.ProbeRequest.class);
        controller.probe(7L,request);
        verify(service).probe("COMFYUI","http://fake-comfy",null,null,java.util.List.of("PluginCustom"));
        controller.probeSavedWorkflow(7L,"saved",new com.aetherflow.ai.controller.NodeConnectionController.WorkflowProbeRequest(java.util.List.of("PluginCustom")));
        verify(service).probeWorkflow(7L,"saved",java.util.List.of("PluginCustom"));
    }
    @Test void pluginOnlyDraftCanSaveAndMissingTypeCannotOverwriteConnection() throws Exception {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
        for(int i=0;i<2;i++) server.expect(requestTo("http://fake-comfy/object_info")).andRespond(withSuccess("{\"PluginCustom\":{\"input\":{}}}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://fake-comfy/object_info")).andRespond(withSuccess("{\"OtherPlugin\":{}}",MediaType.APPLICATION_JSON));
        var discovery=new ImageConnectionDiscovery((url,timeout)->builder.clone().baseUrl(url).build(),Duration.ofSeconds(1));
        var repository=mock(NodeConnectionRepository.class);
        var service=new NodeConnectionService(repository,discovery,mock(NodeConnectionProviderFactory.class),new ImageProviderProperties());
        var json=new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);
        var request=json.readValue("{\"name\":\"synthetic\",\"provider\":\"COMFYUI\",\"baseUrl\":\"http://fake-comfy\",\"workflowNodeTypes\":[\"PluginCustom\"]}",NodeConnectionRequest.class);
        assertThat(service.probe(request.provider(),request.baseUrl(),null,null,request.workflowNodeTypes()).status()).isEqualTo("usable");
        var saved=service.save(7L,null,request);
        when(repository.find(7L,saved.id())).thenReturn(saved);
        assertThatThrownBy(()->service.save(7L,saved.id(),request)).hasMessageContaining("PluginCustom").hasMessageContaining("未保存");
        verify(repository,times(1)).save(eq(7L),eq(saved));server.verify();
    }
}
