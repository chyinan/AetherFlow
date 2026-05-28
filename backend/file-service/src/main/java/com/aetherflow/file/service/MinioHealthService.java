package com.aetherflow.file.service;

import com.aetherflow.file.model.MinioHealthView;

public interface MinioHealthService {

    MinioHealthView check();
}
