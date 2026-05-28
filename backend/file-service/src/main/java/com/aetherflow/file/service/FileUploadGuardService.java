package com.aetherflow.file.service;

import com.aetherflow.file.model.FileUploadProfile;
import org.springframework.web.multipart.MultipartFile;

public interface FileUploadGuardService {

    FileUploadProfile validate(MultipartFile file);
}
