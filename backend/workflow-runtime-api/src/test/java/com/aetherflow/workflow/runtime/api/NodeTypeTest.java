package com.aetherflow.workflow.runtime.api;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NodeTypeTest {

    @Test
    void normalizesNodeTypeValues() {
        NodeType nodeType = NodeType.of(" ai_transcription ");

        assertThat(nodeType.value()).isEqualTo("AI_TRANSCRIPTION");
        assertThat(nodeType).isEqualTo(NodeType.of("AI_TRANSCRIPTION"));
    }

    @Test
    void rejectsBlankNodeType() {
        assertThatThrownBy(() -> NodeType.of(" "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("node type");
    }
}
