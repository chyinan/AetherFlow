package com.aetherflow.file.exception;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;

public class UploadException extends BusinessException {

    public UploadException(String message) {
        super(ResultCode.BAD_REQUEST, message);
    }

    public UploadException(ResultCode resultCode, String message) {
        super(resultCode, message);
    }
}
