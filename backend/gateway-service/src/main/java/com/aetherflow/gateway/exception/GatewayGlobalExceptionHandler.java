package com.aetherflow.gateway.exception;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.gateway.support.GatewayResponseWriter;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.TimeoutException;

/**
 * Converts reactive gateway failures into the shared Result envelope.
 * This keeps authentication, routing, rate-limit and backend failures consistent.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GatewayGlobalExceptionHandler implements ErrorWebExceptionHandler, Ordered {

    private final GatewayResponseWriter responseWriter;

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable exception) {
        HttpStatus httpStatus = resolveHttpStatus(exception);
        ResultCode resultCode = resolveResultCode(httpStatus);
        String message = resolveMessage(httpStatus, exception);

        if (httpStatus == HttpStatus.INTERNAL_SERVER_ERROR) {
            log.error("gateway exception path={} status={}", exchange.getRequest().getURI().getPath(), httpStatus.value(), exception);
        } else if (httpStatus.is5xxServerError()) {
            log.error("gateway exception path={} status={} reason={}: {}",
                    exchange.getRequest().getURI().getPath(),
                    httpStatus.value(),
                    exception.getClass().getSimpleName(),
                    exception.getMessage());
        } else {
            log.warn("gateway exception path={} status={} message={}",
                    exchange.getRequest().getURI().getPath(), httpStatus.value(), message, exception);
        }

        return responseWriter.write(exchange, httpStatus, resultCode, message);
    }

    @Override
    public int getOrder() {
        return -2;
    }

    private HttpStatus resolveHttpStatus(Throwable exception) {
        if (exception instanceof ResponseStatusException responseStatusException) {
            HttpStatusCode statusCode = responseStatusException.getStatusCode();
            HttpStatus status = HttpStatus.resolve(statusCode.value());
            return status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status;
        }
        if (exception instanceof BlockException || BlockException.isBlockException(exception)) {
            return HttpStatus.TOO_MANY_REQUESTS;
        }
        if (exception instanceof TimeoutException) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        if (exception.getClass().getName().endsWith("NotFoundException")) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private ResultCode resolveResultCode(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> ResultCode.BAD_REQUEST;
            case UNAUTHORIZED -> ResultCode.UNAUTHORIZED;
            case FORBIDDEN -> ResultCode.FORBIDDEN;
            case NOT_FOUND -> ResultCode.NOT_FOUND;
            case TOO_MANY_REQUESTS -> ResultCode.TOO_MANY_REQUESTS;
            case SERVICE_UNAVAILABLE -> ResultCode.SERVICE_UNAVAILABLE;
            default -> ResultCode.INTERNAL_ERROR;
        };
    }

    private String resolveMessage(HttpStatus status, Throwable exception) {
        if (exception instanceof ResponseStatusException responseStatusException
                && responseStatusException.getReason() != null) {
            return responseStatusException.getReason();
        }
        return switch (status) {
            case BAD_REQUEST -> "bad request";
            case UNAUTHORIZED -> "unauthorized";
            case FORBIDDEN -> "forbidden";
            case NOT_FOUND -> "route not found";
            case TOO_MANY_REQUESTS -> "too many requests";
            case SERVICE_UNAVAILABLE -> "service unavailable";
            default -> "gateway internal server error";
        };
    }
}
