package com.aetherflow.common.config;

// pattern: Imperative Shell

import com.fasterxml.jackson.core.StreamReadConstraints;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 放宽 Jackson 单字符串读取上限。
 *
 * <p>媒体类节点（FFMPEG 提取音轨、图片/音频产物）把二进制内容以 base64 内联在 JSON 里
 * 传输，单个字段很容易超过 10MB。Jackson 2.15 起默认 {@code maxStringLength} 是
 * 20,000,000 字符，超过就抛：
 *
 * <pre>
 * StreamConstraintsException: String length (20051112) exceeds the maximum length (20000000)
 * </pre>
 *
 * <p>实测场景：18 分钟视频提取 16kHz 单声道 WAV 约 35MB，base64 后约 47MB；
 * ai-service 反序列化 Python 返回值、file-service 反序列化 Feign 请求体时都会踩到。
 *
 * <p>本类放在 {@code com.aetherflow.common} 下，各服务的
 * {@code @SpringBootApplication(scanBasePackages = "com.aetherflow")} 会自动装配，
 * 无需逐个服务重复声明。
 *
 * <p>上限取 80MB：既覆盖 50MB 产物对应的 base64（约 67MB）并留出余量，又不会无限放宽。
 * 由于是读取侧限制放宽，接收方需保证堆内存足够同时容纳 base64 字符串（UTF-16 下约为两倍）
 * 与解码后的字节数组。
 */
@Configuration
public class LargePayloadJacksonConfig {

    /** base64 体积约为原始字节的 4/3，50MB 产物 → 约 67MB 字符串，这里留到 80MB。 */
    private static final int MAX_STRING_LENGTH = 80 * 1024 * 1024;

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer largePayloadReadConstraintsCustomizer() {
        return builder -> builder.postConfigurer(mapper -> mapper.getFactory().setStreamReadConstraints(
                StreamReadConstraints.builder().maxStringLength(MAX_STRING_LENGTH).build()));
    }
}
