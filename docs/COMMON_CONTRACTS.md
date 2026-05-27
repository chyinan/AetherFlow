# Common Module Contracts

`backend/common` is the shared contract layer for all AetherFlow backend services. Microservices should depend on these contracts instead of redefining response wrappers, error codes, JWT helpers, MQ event envelopes, or shared DTOs.

## API Response

Use `com.aetherflow.common.core.Result<T>` for every controller and Feign response.

Required conventions:

- Success: `Result.success(data)`
- Empty success: `Result.success()`
- Failure: throw `BusinessException`; do not manually assemble error JSON in business code.
- `traceId` and `path` fields are reserved for request correlation and can be filled by filters/interceptors.

## Error Codes

Use `ErrorCode` as the stable interface and `ResultCode` as the default shared enum.

Service-specific modules may define their own enum:

```java
public enum WorkflowErrorCode implements ErrorCode {
    DAG_INVALID(42001, "workflow dag invalid");

    private final int code;
    private final String message;
}
```

Do not create another unrelated error-code interface in a microservice.

## Base Entity

Use `BaseEntity` for new MyBatis Plus entities when the table has:

```text
id
created_at
updated_at
```

Existing entities may migrate to it in service-specific tasks. Do not migrate multiple services in the same feature branch unless the task explicitly covers it.

## JWT

Use:

- `JwtProperties`
- `JwtUserClaims`
- `JwtTokenProvider`

Gateway validates JWT and forwards:

```text
X-User-Id
X-Username
X-Roles
```

Business services should consume these headers instead of parsing JWT again unless they own an auth-specific concern.

## Internal Service Calls

Internal endpoints under `/internal/**` are service-to-service APIs and should not be exposed through Gateway unless a task explicitly approves it.

File metadata registration uses:

- Endpoint: `POST file-service/internal/files/metadata`
- Header: `X-Internal-File-Token`
- Token source: `FILE_INTERNAL_TOKEN`

`ai-service` and `file-service` must use the same `FILE_INTERNAL_TOKEN` value in shared environments. Gateway routes only public `/files/**` traffic to file-service; callers should use service discovery for the internal metadata API.

## MQ Event

Use `MqEvent<T>` when publishing cross-service business events. Use `TaskMessageDTO` and `NotifyMessageDTO` for the already-defined task and notification flows.

Required event fields:

- `eventId`
- `eventType`
- `sourceService`
- `aggregateId`
- `traceId`
- `occurredAt`
- `payload`

Queue, exchange, and routing-key names must come from `RabbitMqNames`.

## DTO Ownership

DTOs that cross service boundaries belong in `backend/common/src/main/java/com/aetherflow/common/dto`.

Internal request classes that are only used by one controller may stay inside that service module.

## OpenAPI

`OpenApiConfig` provides shared Swagger metadata and JWT bearer security scheme. Service modules should keep service-specific endpoint annotations in their own controllers, but should not duplicate global OpenAPI configuration.

