package com.aetherflow.file.model;

public enum ProgressState {
    RECEIVED,
    HASHING,
    UPLOADING,
    DEDUPED,
    PERSISTING,
    COMPLETED,
    FAILED
}
