package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.model.ChunkUploadDtos;
import com.aetherflow.file.model.PathMultipartFile;
import com.aetherflow.file.service.ChunkUploadService;
import com.aetherflow.file.service.FileInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class LocalChunkUploadService implements ChunkUploadService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final FileInfoService fileInfoService;
    private final Path rootDirectory;
    private final Map<String, UploadSession> sessions = new ConcurrentHashMap<>();

    @Autowired
    public LocalChunkUploadService(FileInfoService fileInfoService) {
        this(fileInfoService, Path.of(System.getProperty("java.io.tmpdir"), "aetherflow-file-uploads"));
    }

    LocalChunkUploadService(FileInfoService fileInfoService, Path rootDirectory) {
        this.fileInfoService = fileInfoService;
        this.rootDirectory = rootDirectory;
    }

    @Override
    public ChunkUploadDtos.InitResponse init(Long userId, ChunkUploadDtos.InitRequest request) {
        requireUserId(userId);
        if (request == null) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload init request is required");
        }
        String originalName = cleanOriginalName(request.originalName());
        if (!StringUtils.hasText(originalName)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "originalName is required");
        }
        long size = request.size() == null ? -1L : request.size();
        if (size < 0) {
            throw new UploadException(ResultCode.BAD_REQUEST, "file size must not be negative");
        }
        int totalParts = request.totalParts() == null ? 0 : request.totalParts();
        if (totalParts <= 0) {
            throw new UploadException(ResultCode.BAD_REQUEST, "totalParts must be positive");
        }

        String uploadId = UUID.randomUUID().toString().replace("-", "");
        Instant createdAt = Instant.now();
        UploadSession session = new UploadSession(
                uploadId,
                userId,
                originalName,
                resolveContentType(request.contentType()),
                size,
                totalParts,
                normalizeChecksum(request.checksum()),
                createdAt,
                rootDirectory.resolve(uploadId)
        );
        try {
            Files.createDirectories(session.directory());
        } catch (IOException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload temp directory unavailable");
        }
        sessions.put(uploadId, session);
        return new ChunkUploadDtos.InitResponse(
                uploadId,
                originalName,
                session.contentType(),
                size,
                totalParts,
                createdAt.toString()
        );
    }

    @Override
    public ChunkUploadDtos.PartResponse uploadPart(Long userId, String uploadId, int partNumber, MultipartFile part) {
        UploadSession session = requireSession(userId, uploadId);
        if (partNumber <= 0 || partNumber > session.totalParts()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "partNumber is out of range");
        }
        if (part == null || part.isEmpty()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk part must not be empty");
        }
        Path partPath = partPath(session, partNumber);
        try (InputStream inputStream = part.getInputStream()) {
            Files.copy(inputStream, partPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk part write failed");
        }
        long size = safeSize(partPath);
        session.parts().put(partNumber, size);
        return new ChunkUploadDtos.PartResponse(
                session.uploadId(),
                partNumber,
                size,
                session.parts().size(),
                session.totalParts(),
                session.parts().size() == session.totalParts()
        );
    }

    @Override
    public FileMetadataDTO complete(Long userId, String uploadId, ChunkUploadDtos.CompleteRequest request) {
        UploadSession session = requireSession(userId, uploadId);
        ensureAllPartsReceived(session);
        String expectedChecksum = request != null && StringUtils.hasText(request.checksum())
                ? normalizeChecksum(request.checksum())
                : session.checksum();
        Path assembled = session.directory().resolve("assembled.bin");
        try {
            assemble(session, assembled);
            if (StringUtils.hasText(expectedChecksum)) {
                String actualChecksum = sha256(assembled);
                if (!expectedChecksum.equalsIgnoreCase(actualChecksum)) {
                    throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload checksum mismatch");
                }
            }
            PathMultipartFile multipartFile = new PathMultipartFile(
                    assembled,
                    "file",
                    session.originalName(),
                    session.contentType()
            );
            return fileInfoService.upload(userId, multipartFile, uploadId);
        } finally {
            sessions.remove(uploadId);
            deleteDirectory(session.directory());
        }
    }

    @Override
    public void abort(Long userId, String uploadId) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        UploadSession session = sessions.get(uploadId);
        if (session == null) {
            return;
        }
        if (!session.userId().equals(userId)) {
            throw new UploadException(ResultCode.FORBIDDEN, "chunk upload session does not belong to current user");
        }
        sessions.remove(uploadId);
        deleteDirectory(session.directory());
    }

    private void ensureAllPartsReceived(UploadSession session) {
        for (int partNumber = 1; partNumber <= session.totalParts(); partNumber++) {
            if (!session.parts().containsKey(partNumber) || !Files.exists(partPath(session, partNumber))) {
                throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload has missing parts");
            }
        }
    }

    private void assemble(UploadSession session, Path assembled) {
        try (OutputStream outputStream = Files.newOutputStream(assembled)) {
            for (int partNumber = 1; partNumber <= session.totalParts(); partNumber++) {
                Files.copy(partPath(session, partNumber), outputStream);
            }
        } catch (UploadException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload assemble failed");
        }
    }

    private String sha256(Path path) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream inputStream = new DigestInputStream(Files.newInputStream(path), digest)) {
                inputStream.transferTo(OutputStream.nullOutputStream());
            }
            byte[] bytes = digest.digest();
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload checksum failed");
        }
    }

    private UploadSession requireSession(Long userId, String uploadId) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        UploadSession session = sessions.get(uploadId);
        if (session == null) {
            throw new UploadException(ResultCode.NOT_FOUND, "chunk upload session not found");
        }
        if (!session.userId().equals(userId)) {
            throw new UploadException(ResultCode.FORBIDDEN, "chunk upload session does not belong to current user");
        }
        return session;
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "missing gateway user context");
        }
    }

    private Path partPath(UploadSession session, int partNumber) {
        return session.directory().resolve("part-%05d.bin".formatted(partNumber));
    }

    private String cleanOriginalName(String originalName) {
        String cleaned = StringUtils.cleanPath(originalName == null ? "" : originalName);
        return cleaned.replace("\\", "_").replace("/", "_");
    }

    private String resolveContentType(String contentType) {
        return StringUtils.hasText(contentType) ? contentType : DEFAULT_CONTENT_TYPE;
    }

    private String normalizeChecksum(String checksum) {
        return StringUtils.hasText(checksum) ? checksum.trim().toLowerCase(java.util.Locale.ROOT) : null;
    }

    private long safeSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException exception) {
            return 0L;
        }
    }

    private void deleteDirectory(Path directory) {
        if (directory == null || !Files.exists(directory) || !directory.startsWith(rootDirectory)) {
            return;
        }
        try (var walk = Files.walk(directory)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    log.warn("Failed to delete chunk upload temp path path={}", path, exception);
                }
            });
        } catch (IOException exception) {
            log.warn("Failed to cleanup chunk upload temp dir dir={}", directory, exception);
        }
    }

    private record UploadSession(
            String uploadId,
            Long userId,
            String originalName,
            String contentType,
            long size,
            int totalParts,
            String checksum,
            Instant createdAt,
            Path directory,
            Map<Integer, Long> parts
    ) {

        private UploadSession(String uploadId,
                              Long userId,
                              String originalName,
                              String contentType,
                              long size,
                              int totalParts,
                              String checksum,
                              Instant createdAt,
                              Path directory) {
            this(uploadId, userId, originalName, contentType, size, totalParts, checksum, createdAt, directory,
                    new ConcurrentHashMap<>());
        }
    }
}
