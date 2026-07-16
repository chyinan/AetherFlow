package com.aetherflow.workflow.ingestion.url;

import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchRequest;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchResponse;

public interface UrlIngestionService {

    UrlFetchResponse fetch(UrlFetchRequest request);
}
