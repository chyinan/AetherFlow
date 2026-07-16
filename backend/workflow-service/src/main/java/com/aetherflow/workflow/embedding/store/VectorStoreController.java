package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigRequest;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreConfigResponse;
import com.aetherflow.workflow.embedding.store.VectorStoreDtos.VectorStoreTestResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/knowledge/vector-stores")
@RequiredArgsConstructor
@Tag(name = "Knowledge Vector Stores", description = "Runtime vector store configuration for embedding workflow nodes.")
public class VectorStoreController {

    private final VectorStoreConfigService configService;

    @GetMapping
    @Operation(summary = "Get vector store runtime configuration")
    public Result<VectorStoreConfigResponse> current() {
        return Result.success(configService.current());
    }

    @PutMapping("/default")
    @Operation(summary = "Update default vector store runtime configuration")
    public Result<VectorStoreConfigResponse> update(@Valid @RequestBody VectorStoreConfigRequest request) {
        return Result.success(configService.update(request));
    }

    @PostMapping("/test")
    @Operation(summary = "Validate vector store configuration")
    public Result<VectorStoreTestResponse> test(@Valid @RequestBody VectorStoreConfigRequest request) {
        return Result.success(configService.test(request));
    }
}
