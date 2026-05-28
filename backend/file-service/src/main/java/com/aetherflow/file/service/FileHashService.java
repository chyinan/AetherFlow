package com.aetherflow.file.service;

import org.springframework.web.multipart.MultipartFile;

public interface FileHashService {

    String sha256(MultipartFile file);
}
