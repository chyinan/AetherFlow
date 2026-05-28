package com.aetherflow.file.service.impl;

import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.model.MinioHealthView;
import com.aetherflow.file.service.MinioHealthService;
import com.aetherflow.file.support.FileLogContext;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class MinioHealthServiceImpl implements MinioHealthService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;

    @Override
    public MinioHealthView check() {
        long start = System.nanoTime();
        try {
            boolean bucketExists = minioClient.bucketExists(BucketExistsArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .build());
            long latencyMs = elapsedMs(start);
            if (bucketExists) {
                return new MinioHealthView("UP", "MinIO bucket reachable", latencyMs);
            }
            return new MinioHealthView("DOWN", "MinIO bucket does not exist", latencyMs);
        } catch (Exception exception) {
            long latencyMs = elapsedMs(start);
            log.warn("MinIO health check failed traceId={} fileId={} userId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception);
            return new MinioHealthView("DOWN", "MinIO unreachable", latencyMs);
        }
    }

    private long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000L;
    }
}
