package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    @PostMapping("/upload")
    public Result<FileMetadataDTO> upload(@RequestHeader("X-User-Id") Long userId,
                                          @RequestParam("file") MultipartFile file) {
        return Result.success(fileStorageService.upload(userId, file));
    }
}

