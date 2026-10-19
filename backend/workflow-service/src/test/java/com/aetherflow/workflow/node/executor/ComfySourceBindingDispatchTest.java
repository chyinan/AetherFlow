package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.*;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.*;
import com.aetherflow.workflow.node.*;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ComfySourceBindingDispatchTest {
    @Test void explicitBindingResolvesIdsArraysAndInlineBase64BeforeAiDispatchAndLeavesUnboundGraphAlone() {
        for(boolean async:List.of(false,true)) {
            for(Object source:List.of(7L,List.of(7L,8L),"aW1hZ2U=","data:image/png;base64,aW1hZ2U=")) verifySource(source,true,async);
            verifySource(List.of(7L),false,async);
        }
    }
    private void verifySource(Object source,boolean bound,boolean async) {
        var ai=mock(AiWorkflowNodeClient.class);var files=mock(FileMetadataClient.class);var storage=mock(ImageArtifactStorage.class);
        when(files.getMetadata(anyString(),eq(7L),eq(7L))).thenReturn(Result.success(new FileMetadataDTO(7L,"images","source.png","source.png","image/png",5L,null)));
        when(files.downloadFile(anyString(),eq(7L),eq(7L))).thenReturn(ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body("image".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        AtomicReference<Map<String,Object>> captured=new AtomicReference<>();
        when(ai.execute(any())).thenAnswer(call->{captured.set(((AiWorkflowNodeRequestDTO)call.getArgument(0)).getPayload());throw new IllegalStateException("controlled stop before provider");});
        var config=Map.<String,Object>of("provider","COMFYUI","mode",bound?"workflow":"img2img","sourceImageVariable","imageFileIds",
                "workflowJson",Map.of("1",Map.of("class_type","LoadImage","inputs",Map.of("image","original.png"))),
                "workflowBindings",bound?List.of(Map.of("nodeId","1","inputName","image","parameter","sourceImage")):List.of());
        var variables=new LinkedHashMap<String,Object>(Map.of("imageFileIds",source,"userId",7L));variables.put(WorkflowNodeContextKeys.NODE_CONFIGS,Map.of("image",config));
        var context=new DefaultWorkflowContext("synthetic","trace","task",variables);context.updateCurrentNodeId("image");
        var executor=new ImageGenerationNodeExecutor(new WorkflowNodeMetrics(),ai,storage,new ImageSourceResolver(files,new WorkflowNodeProperties()));
        if(async) {
            var dispatcher=mock(AsyncAiTaskDispatcher.class);when(dispatcher.isEnabled()).thenReturn(true);
            when(dispatcher.dispatch(any(),anyString(),any())).thenAnswer(call->{captured.set(call.getArgument(2));return 123L;});
            org.springframework.test.util.ReflectionTestUtils.setField(executor,"asyncAiTaskDispatcher",dispatcher);
            assertThatThrownBy(()->executor.execute(context)).isInstanceOf(com.aetherflow.workflow.runtime.api.NodeWaitingException.class);
            verifyNoInteractions(ai);
        } else assertThatThrownBy(()->executor.execute(context)).isInstanceOf(BusinessException.class);
        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().get("sourceImage")).isEqualTo(bound?"aW1hZ2U=":source);
        if(bound && !(source instanceof String)) {verify(files).getMetadata(anyString(),eq(7L),eq(7L));verify(files).downloadFile(anyString(),eq(7L),eq(7L));}
        else verifyNoInteractions(files);
        assertThat(variables.get("imageFileIds")).isEqualTo(source);verifyNoInteractions(storage);
    }
}
