package com.aetherflow.file.exception;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;

public class StorageException extends BusinessException {

    public StorageException(String message) {
        super(ResultCode.SERVICE_UNAVAILABLE, message);
    }
}
