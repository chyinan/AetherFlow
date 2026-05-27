package com.aetherflow.common.core;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ResultTest {

    @Test
    void successWrapsDataWithDefaultCodeAndMessage() {
        Result<String> result = Result.success("ok");

        assertThat(result.getCode()).isEqualTo(ResultCode.SUCCESS.getCode());
        assertThat(result.getMessage()).isEqualTo(ResultCode.SUCCESS.getMessage());
        assertThat(result.getData()).isEqualTo("ok");
        assertThat(result.isSuccess()).isTrue();
    }

    @Test
    void failWrapsBusinessCodeAndMessage() {
        Result<Void> result = Result.fail(ResultCode.BAD_REQUEST);

        assertThat(result.getCode()).isEqualTo(ResultCode.BAD_REQUEST.getCode());
        assertThat(result.getMessage()).isEqualTo(ResultCode.BAD_REQUEST.getMessage());
        assertThat(result.getData()).isNull();
        assertThat(result.isSuccess()).isFalse();
    }

    @Test
    void failAcceptsCustomErrorCodeContract() {
        ErrorCode customErrorCode = new ErrorCode() {
            @Override
            public int getCode() {
                return 46001;
            }

            @Override
            public String getMessage() {
                return "custom workflow error";
            }
        };

        Result<Void> result = Result.fail(customErrorCode);

        assertThat(result.getCode()).isEqualTo(46001);
        assertThat(result.getMessage()).isEqualTo("custom workflow error");
        assertThat(result.isSuccess()).isFalse();
    }

    @Test
    void withRequestContextKeepsTraceIdAndPath() {
        Result<String> result = Result.success("ok").withRequestContext("trace-1", "/health");

        assertThat(result.getTraceId()).isEqualTo("trace-1");
        assertThat(result.getPath()).isEqualTo("/health");
    }
}
