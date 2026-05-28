package com.aetherflow.file.exception;

import com.aetherflow.common.core.ErrorCode;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.support.FileLogContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "com.aetherflow.file")
public class FileExceptionHandler {

    @ExceptionHandler(FileTypeException.class)
    public ResponseEntity<Result<Void>> handleFileTypeException(FileTypeException exception,
                                                               HttpServletRequest request) {
        log.warn("File type rejected traceId={} fileId={} userId={} reason={}",
                FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception.getMessage());
        return buildResponse(exception.getErrorCode(), exception.getMessage(), request);
    }

    @ExceptionHandler(UploadException.class)
    public ResponseEntity<Result<Void>> handleUploadException(UploadException exception,
                                                             HttpServletRequest request) {
        log.warn("Upload rejected traceId={} fileId={} userId={} reason={}",
                FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception.getMessage());
        return buildResponse(exception.getErrorCode(), exception.getMessage(), request);
    }

    @ExceptionHandler(StorageException.class)
    public ResponseEntity<Result<Void>> handleStorageException(StorageException exception,
                                                              HttpServletRequest request) {
        log.error("Storage operation failed traceId={} fileId={} userId={} reason={}",
                FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception.getMessage());
        return buildResponse(exception.getErrorCode(), exception.getMessage(), request);
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Result<Void>> handleBusinessException(BusinessException exception,
                                                               HttpServletRequest request) {
        log.warn("File service business exception traceId={} fileId={} userId={} reason={}",
                FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception.getMessage());
        return buildResponse(exception.getErrorCode(), exception.getMessage(), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Result<Void>> handleMaxUploadSize(MaxUploadSizeExceededException exception,
                                                           HttpServletRequest request) {
        log.warn("Multipart size rejected traceId={} fileId={} userId={}",
                FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId());
        return buildResponse(ResultCode.BAD_REQUEST, "upload file exceeds multipart limit", request);
    }

    private ResponseEntity<Result<Void>> buildResponse(ErrorCode errorCode,
                                                      String message,
                                                      HttpServletRequest request) {
        return ResponseEntity.status(resolveHttpStatus(errorCode))
                .body(Result.<Void>fail(errorCode, message)
                        .withRequestContext(FileLogContext.traceId(), request.getRequestURI()));
    }

    private HttpStatus resolveHttpStatus(ErrorCode errorCode) {
        int code = errorCode.getCode();
        if (code == ResultCode.UNAUTHORIZED.getCode()) {
            return HttpStatus.UNAUTHORIZED;
        }
        if (code == ResultCode.FORBIDDEN.getCode()) {
            return HttpStatus.FORBIDDEN;
        }
        if (code == ResultCode.NOT_FOUND.getCode()) {
            return HttpStatus.NOT_FOUND;
        }
        if (code == ResultCode.CONFLICT.getCode()) {
            return HttpStatus.CONFLICT;
        }
        if (code == ResultCode.TOO_MANY_REQUESTS.getCode()) {
            return HttpStatus.TOO_MANY_REQUESTS;
        }
        if (code == ResultCode.SERVICE_UNAVAILABLE.getCode()) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        if (code >= 40000 && code < 50000 || code == ResultCode.BAD_REQUEST.getCode()) {
            return HttpStatus.BAD_REQUEST;
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
}
