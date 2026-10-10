package com.aetherflow.ai.copilot.service;

// pattern: Imperative Shell
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CopilotCanvasEditsTest {
    @Test
    void parsesBoundedCreationAndUpdate() {
        var result = CopilotCanvasEdits.parse("""
                {"status":"READY","explanation":"创建工作流","operations":[
                {"type":"add_node","nodeId":"start-1","kind":"start","position":{"x":80,"y":180}},
                {"type":"update_node","nodeId":"llm-1","config":{"prompt":"输出中文","temperature":0.3}},
                {"type":"connect","source":"start-1","target":"llm-1"}]}
                """);
        assertThat(result.operations()).hasSize(3);
        assertThat(result.operations().get(1).config()).containsEntry("temperature", 0.3);
    }

    @Test
    void rejectsUnknownActionsSecretsRoutingAndMalformedEnvelopes() {
        for (String operation : java.util.List.of(
                "{\"type\":\"run\",\"nodeId\":\"x\"}",
                "{\"type\":\"update_node\",\"nodeId\":\"x\",\"config\":{\"apiKey\":\"private\"}}",
                "{\"type\":\"add_node\",\"nodeId\":\"x\",\"kind\":\"llm\",\"config\":{\"next\":\"y\"}}",
                "{\"type\":\"update_node\",\"nodeId\":\"x\",\"config\":{\"prompt\":\"[redacted]\"}}",
                "{\"type\":\"connect\",\"source\":\"x\"}",
                "{\"type\":\"delete_node\",\"nodeId\":\"x\",\"unexpected\":true}")) {
            assertThatThrownBy(() -> CopilotCanvasEdits.parse(
                    "{\"status\":\"READY\",\"explanation\":\"修改\",\"operations\":[" + operation + "]}"))
                    .isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> CopilotCanvasEdits.parse("{\"status\":\"READY\",\"explanation\":\"空\",\"operations\":[]}"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> CopilotCanvasEdits.parse("x".repeat(64001))).isInstanceOf(BusinessException.class);
    }

    @Test
    void clarificationDoesNotReturnEditsAndContextIsRedacted() {
        assertThat(CopilotCanvasEdits.parse("{\"status\":\"NEEDS_CLARIFICATION\",\"explanation\":\"输入是文件还是文本？\",\"operations\":[]}").operations()).isEmpty();
        String prompt = CopilotCanvasEdits.prompt(Map.of("nodes", java.util.List.of(Map.of("config", Map.of("apiKey", "private-key")))), "", "创建流程");
        assertThat(prompt).contains("创建流程", "[redacted]").doesNotContain("private-key");
    }
}
