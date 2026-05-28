package com.aetherflow.file.service.impl;

import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.service.FileHashService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
public class FileHashServiceImpl implements FileHashService {

    @Override
    public String sha256(MultipartFile file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream inputStream = file.getInputStream();
                 DigestInputStream digestInputStream = new DigestInputStream(inputStream, digest)) {
                digestInputStream.transferTo(OutputStream.nullOutputStream());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", exception);
        } catch (IOException exception) {
            throw new UploadException("calculate file SHA256 failed");
        }
    }
}
