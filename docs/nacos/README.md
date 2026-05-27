# Nacos Configuration

Each Spring service imports an optional Nacos config named after `spring.application.name`:

```yaml
spring:
  config:
    import: optional:nacos:${spring.application.name}.yml?group=DEFAULT_GROUP&refreshEnabled=true
```

Default discovery and config address:

```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_ADDR:192.168.101.68:8848}
      config:
        server-addr: ${NACOS_ADDR:192.168.101.68:8848}
        file-extension: yml
```

For Docker Compose, `NACOS_ADDR` is set to `nacos:8848`.

