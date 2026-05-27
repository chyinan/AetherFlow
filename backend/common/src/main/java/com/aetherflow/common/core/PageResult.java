package com.aetherflow.common.core;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Paged response payload.")
public class PageResult<T> {

    @Schema(description = "Current page number, starting from 1.", example = "1")
    private long pageNo;

    @Schema(description = "Page size.", example = "20")
    private long pageSize;

    @Schema(description = "Total record count.", example = "100")
    private long total;

    @Schema(description = "Page records.")
    private List<T> records;
}

