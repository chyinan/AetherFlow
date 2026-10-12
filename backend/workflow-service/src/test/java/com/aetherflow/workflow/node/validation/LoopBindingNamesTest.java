package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LoopBindingNamesTest {
    @Test void 所有可写绑定拒绝明确保留名和框架前缀() {
        for (String type : List.of("ITERATION", "LOOP")) {
            List<String> fields = type.equals("ITERATION")
                    ? List.of("itemVariable", "indexVariable", "outputVariable")
                    : List.of("inputVariable", "indexVariable", "outputVariable");
            for (String field : fields) {
                for (String name : List.of("userId", "username", "__workflowNodeConfigs", "__nestedNodeTypes", "__nestedContexts", "__runtime", " userId ")) {
                    assertThat(LoopBindingNames.validate(type, Map.of(field, name)))
                            .containsExactly(field + " 不能使用保留变量名 '" + name.trim() + "'");
                }
            }
        }
    }

    @Test void 正常自定义名称默认配置和只读输入不受影响() {
        assertThat(LoopBindingNames.validate("ITERATION", Map.of("inputVariable", "userId", "itemVariable", "entry", "indexVariable", "position", "outputVariable", "batchResults"))).isEmpty();
        assertThat(LoopBindingNames.validate("LOOP", Map.of("inputVariable", "currentState", "indexVariable", "round", "outputVariable", "nextState"))).isEmpty();
        assertThat(LoopBindingNames.validate("ITERATION", Map.of())).isEmpty();
        assertThat(LoopBindingNames.validate("LOOP", Map.of())).isEmpty();
        assertThat(LoopBindingNames.validate("ITERATION", Map.of("itemVariable", "userIdValue", "indexVariable", "_index", "outputVariable", "usernameResult"))).isEmpty();
        assertThat(LoopBindingNames.validate("PROMPT", Map.of("outputVariable", "userId"))).isEmpty();
    }

    @Test void 服务端目录校验调用同一绑定规则() {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("batch"); node.setNodeType("ITERATION");
        node.setConfig(Map.of("itemVariable", "userId", "indexVariable", "position", "outputVariable", "results"));
        assertThat(WorkflowNodeConfigValidator.validate(node, new WorkflowNodeCatalogService().catalog()))
                .contains("node batch (ITERATION): itemVariable 不能使用保留变量名 'userId'");
        node.setNodeType("LOOP"); node.setConfig(Map.of("inputVariable", "username", "outputVariable", "state"));
        assertThat(WorkflowNodeConfigValidator.validate(node, new WorkflowNodeCatalogService().catalog()))
                .contains("node batch (LOOP): inputVariable 不能使用保留变量名 'username'");
    }
}
