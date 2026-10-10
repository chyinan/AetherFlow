package com.aetherflow.ai.controller;

import com.aetherflow.ai.connection.NodeConnectionProbe;
import com.aetherflow.ai.connection.NodeConnectionProfile;
import com.aetherflow.ai.connection.NodeConnectionRequest;
import com.aetherflow.ai.connection.NodeConnectionService;
import com.aetherflow.common.core.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "节点连接", description = "图像节点连接管理与只读服务目录探测")
@RequestMapping("/ai/node-connections")
@RequiredArgsConstructor
public class NodeConnectionController {
    private final NodeConnectionService service;

    @GetMapping
    @Operation(summary = "获取个人连接与只读部署默认连接")
    public Result<ConnectionList> list(@RequestHeader("X-User-Id") Long userId) {
        return Result.success(new ConnectionList(service.list(userId)));
    }

    @PostMapping
    @Operation(summary = "测试并保存新连接")
    public Result<NodeConnectionProfile> create(@RequestHeader("X-User-Id") Long userId,
                                                 @Valid @RequestBody NodeConnectionRequest request) {
        return Result.success(service.save(userId, null, request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "测试并更新已有连接，测试失败保留原配置")
    public Result<NodeConnectionProfile> update(@RequestHeader("X-User-Id") Long userId, @PathVariable String id,
                                                 @Valid @RequestBody NodeConnectionRequest request) {
        return Result.success(service.save(userId, id, request));
    }

    @PostMapping("/probe")
    @Operation(summary = "只读探测草稿连接，不持久化、不加载模型")
    public Result<NodeConnectionProbe> probe(@RequestHeader("X-User-Id") Long userId,
                                              @Valid @RequestBody ProbeRequest request) {
        return Result.success(service.probe(request.provider(), request.baseUrl(), request.checkpoint(), request.nodeType()));
    }

    @GetMapping("/{id}/probe")
    @Operation(summary = "只读探测已有连接")
    public Result<NodeConnectionProbe> probeSaved(@RequestHeader("X-User-Id") Long userId,
                                                  @PathVariable String id,
                                                  @RequestParam(required = false) String checkpoint,
                                                  @RequestParam(required = false) String nodeType) {
        return Result.success(service.probe(userId, id, checkpoint, nodeType));
    }

    public record ConnectionList(List<NodeConnectionProfile> connections) {
    }

    public record ProbeRequest(@Size(max = 80) String provider, @Size(max = 2048) String baseUrl,
                               @Size(max = 1024) String checkpoint, @Size(max = 80) String nodeType) {
    }
}
