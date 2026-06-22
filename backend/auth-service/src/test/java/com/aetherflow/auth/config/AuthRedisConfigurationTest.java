package com.aetherflow.auth.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class AuthRedisConfigurationTest {

    @Test
    void redisClientIsAvailableOnAuthServiceClasspath() {
        assertThatCode(() -> Class.forName("org.springframework.data.redis.core.StringRedisTemplate"))
                .doesNotThrowAnyException();
    }

    @Test
    void applicationYmlDefinesSharedRedisDefaults() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties properties = yaml.getObject();

        assertThat(properties).isNotNull();
        assertThat(properties.getProperty("spring.data.redis.host")).isEqualTo("${REDIS_HOST:192.168.101.68}");
        assertThat(properties.getProperty("spring.data.redis.port")).isEqualTo("${REDIS_PORT:6379}");
        assertThat(properties.getProperty("spring.data.redis.database")).isEqualTo("${REDIS_DATABASE:0}");
        assertThat(properties.getProperty("spring.data.redis.timeout")).isEqualTo("3s");
    }

    @Test
    void applicationYmlDefinesAuthGovernanceDefaults() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties properties = yaml.getObject();

        assertThat(properties).isNotNull();
        assertThat(properties.getProperty("aetherflow.auth.token.refresh-expire-minutes"))
                .isEqualTo("${JWT_REFRESH_EXPIRE_MINUTES:10080}");
        assertThat(properties.getProperty("aetherflow.auth.token.refresh-secret"))
                .isEqualTo("${JWT_REFRESH_SECRET:}");
        assertThat(properties.getProperty("aetherflow.auth.security.login-rate-limit-per-minute"))
                .isEqualTo("${AUTH_LOGIN_RATE_LIMIT_PER_MINUTE:20}");
        assertThat(properties.getProperty("aetherflow.auth.security.password-max-failures"))
                .isEqualTo("${AUTH_PASSWORD_MAX_FAILURES:5}");
        assertThat(properties.getProperty("logging.pattern.console"))
                .contains("traceId=%X{traceId}", "userId=%X{userId}", "requestId=%X{requestId}");
    }
}
