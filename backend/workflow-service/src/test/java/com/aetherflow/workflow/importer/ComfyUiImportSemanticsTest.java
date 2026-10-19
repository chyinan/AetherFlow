package com.aetherflow.workflow.importer;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class ComfyUiImportSemanticsTest {
    private final ComfyUiWorkflowImportService service = new ComfyUiWorkflowImportService();
    @Test void followsUiLinksAndReportsPluginPositiveAsUnresolvedWithoutUsingNegativeText() {
        var ui = Map.<String,Object>of("nodes", List.of(
                Map.of("id",61,"type","CLIPTextEncode","widgets_values",List.of(""),"inputs",List.of(Map.of("name","text","link",122))),
                Map.of("id",53,"type","KSampler","inputs",List.of(Map.of("name","positive","link",124),Map.of("name","negative","link",108))),
                Map.of("id",12,"type","CLIPTextEncode","widgets_values",List.of("synthetic low quality")),
                Map.of("id",58,"type","ExamplePluginText","widgets_values",List.of("synthetic positive"))),
                "links", List.of(List.of(122,58,0,61,0,"STRING"), List.of(124,61,0,53,0,"CONDITIONING"),List.of(108,12,0,53,1,"CONDITIONING")),
                "extra", Map.of("frontendVersion","test"));
        var result = service.importWorkflow("test", null, null, ui);
        assertThat(result.getNodes()).hasSize(4);
        var prompt = result.getNodes().get(1).getConfig();
        assertThat(prompt).containsEntry("prompt", "").containsEntry("negativePrompt", "synthetic low quality");
        var image = result.getNodes().get(2).getConfig();
        assertThat(image).containsEntry("workflow",ui).containsEntry("workflowJson",ui).containsEntry("workflowBindings",List.of());
        assertThat((Map<?,?>)image.get("comfyImport")).isEqualTo(Map.of("format","UI","nodeCount",4,"positiveStatus","unresolved","negativeStatus","resolved","pluginStatus","unverified"));
    }
    @Test void apiDirectionUsesSamplerReferencesRatherThanMapOrder() {
        Map<String,Object> api = new LinkedHashMap<>();
        api.put("negative",Map.of("class_type","CLIPTextEncode","inputs",Map.of("text","synthetic negative")));
        api.put("positive",Map.of("class_type","CLIPTextEncode","inputs",Map.of("text","synthetic positive")));
        api.put("sampler",Map.of("class_type","KSampler","inputs",Map.of("positive",List.of("positive",0),"negative",List.of("negative",0))));
        var config = service.importWorkflow("test",null,null,api).getNodes().get(1).getConfig();
        assertThat(config).containsEntry("prompt","synthetic positive").containsEntry("negativePrompt","synthetic negative");
    }
    @Test void rejectsMixedFormatWithoutDiscardingUnknownTypes() {
        var mixed = Map.of("nodes",List.of(Map.of("id",1,"type","Plugin")),"2",Map.of("class_type","Plugin","inputs",Map.of()));
        assertThatThrownBy(() -> service.importWorkflow("test",null,null,mixed)).isInstanceOf(BusinessException.class);
    }
}
