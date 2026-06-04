package com.aetherflow.file.service;

import com.aetherflow.file.model.ProgressState;
import com.aetherflow.file.model.UploadProgressView;

import java.util.Optional;

public interface FileGovernanceCacheService {

    void checkUploadRate(Long userId);

    Optional<Long> findCachedHashFileId(String sha256);

    boolean tryReserveHashUpload(String sha256, String taskId);

    void releaseHashReservation(String sha256, String taskId);

    void cacheHash(String sha256, Long fileId);

    void evictHashCache(String sha256);

    void recordUpload(Long fileId, Long userId, String taskId, String sha256, ProgressState state);

    void recordProgress(String taskId,
                        ProgressState state,
                        int percentage,
                        Long fileId,
                        Long userId,
                        String sha256,
                        String message);

    UploadProgressView getProgress(Long userId, String taskId);

    long countUploadingTasks();
}
