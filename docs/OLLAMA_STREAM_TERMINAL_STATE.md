# Ollama 流的终态校验

## 场景

受影响的旧 Ollama 在回答未完成时正常结束 HTTP，SDK 迭代随即结束，但整条流里没有
`done=true` 终块。服务端此前在迭代结束时自行发送 `[DONE]`，把半截回答标成完整回答：
Java 侧收到 `[DONE]` 就认为流正常结束，半截内容被当成完成结果保存。

上游依据：https://github.com/ollama/ollama/pull/18374 （不据此推断受影响的 Ollama 版本范围）。

## 契约

- 只有 Provider 报出成功终块（`done=true`）才算完成；缺终块的正常 EOF 走错误链，
  不发 `[DONE]`
- 缺终块时返回错误事件（`stream_incomplete`），已产出的部分文本不视为完成结果
- 空流同样按缺终块处理
- Provider 异常沿用既有语义向上冒泡，不改写为完成
- 取消语义不变：消费端取消后关闭流与客户端
- SDK 对象响应兼容保持：正文与终块标记都按对象/字典两种形态读取
- 已有文本输出后不切换备用 Provider（由 Java 侧路由的 `streamStarted` 保护），
  半截输出后不拼接其他 Provider 的结果

## 验证范围

Python 回归使用固定依赖里真实的 `GenerateResponse` 类型（不是真实模型推理），覆盖：
有终块正常完成、无终块正常 EOF、空流、Provider 异常、消费端取消、SDK 对象与旧字典
格式。
