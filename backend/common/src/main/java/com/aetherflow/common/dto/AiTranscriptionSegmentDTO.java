package com.aetherflow.common.dto;

// pattern: Functional Core

/** 结构化转写片段，时间单位为秒。 */
public record AiTranscriptionSegmentDTO(double start, double end, String text) { }
