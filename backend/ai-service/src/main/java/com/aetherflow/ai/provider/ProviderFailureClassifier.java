package com.aetherflow.ai.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.net.SocketTimeoutException;

public final class ProviderFailureClassifier {

    private ProviderFailureClassifier() {
    }

    public static ProviderFailureType classify(Throwable throwable) {
        Throwable root = NestedExceptionUtils.getMostSpecificCause(throwable);
        if (throwable instanceof UnsupportedOperationException) {
            return ProviderFailureType.UNSUPPORTED;
        }
        if (throwable instanceof BusinessException businessException) {
            if (businessException.getErrorCode() == ResultCode.TOO_MANY_REQUESTS) {
                return ProviderFailureType.RATE_LIMITED;
            }
            if (businessException.getErrorCode() == ResultCode.SERVICE_UNAVAILABLE) {
                return ProviderFailureType.PROVIDER_UNAVAILABLE;
            }
            if (businessException.getErrorCode() == ResultCode.BAD_REQUEST) {
                return ProviderFailureType.INVALID_RESPONSE;
            }
        }
        if (throwable instanceof RestClientResponseException responseException) {
            int statusCode = responseException.getStatusCode().value();
            if (statusCode == 429) {
                return ProviderFailureType.RATE_LIMITED;
            }
            if (statusCode >= 500) {
                return ProviderFailureType.SERVER_ERROR;
            }
            if (statusCode >= 400) {
                return ProviderFailureType.PROVIDER_UNAVAILABLE;
            }
        }
        if (throwable instanceof ResourceAccessException) {
            if (root instanceof SocketTimeoutException || contains(root, "timeout")) {
                return ProviderFailureType.TIMEOUT;
            }
            return ProviderFailureType.CONNECTION_ERROR;
        }
        if (contains(root, "timeout")) {
            return ProviderFailureType.TIMEOUT;
        }
        return ProviderFailureType.UNKNOWN;
    }

    private static boolean contains(Throwable throwable, String keyword) {
        if (throwable == null || keyword == null) {
            return false;
        }
        String message = throwable.getMessage();
        return message != null && message.toLowerCase().contains(keyword.toLowerCase());
    }
}
