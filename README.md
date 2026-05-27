# 人用开工登记表｜企业实训 Vibe Coding

> 本文件给组员使用，不是给 Agent 直接执行。  
> 目的：每次开始任务前，先把任务边界写清楚，再交给 Agent。  
> 原则：人负责定义边界，Agent 只能在边界内写代码。

---

## 1. 每次开始任务前必须填写

把下面内容填完，再发给 Agent。

```text
任务ID：
任务名称：
负责人：
Agent ID：
Session ID：
开发分支：feature/{任务ID}-{说明}

任务目标：

允许修改文件：
1. 
2. 

禁止修改文件：
1. 
2. 

是否允许新增文件：是 / 否
如果允许，允许新增的位置：

是否允许修改接口：是 / 否
如果允许，接口说明：

是否允许修改数据库：是 / 否
如果允许，数据库变更说明：

是否允许修改配置：是 / 否
如果允许，配置文件和配置项：

是否涉及前端：是 / 否
是否涉及后端：是 / 否
是否涉及统一运行电脑运行：是 / 否

必须运行的验证：
1. 
2. 

完成标准：
1. 
2. 

特别禁止：
1. 不要顺手重构无关代码。
2. 不要修改未列入允许范围的文件。
3. 不要直接 push main。
4. 不要把统一运行电脑上的临时修改当成正式代码。
```

---

## 2. 任务边界填写说明

### 2.1 任务目标

写清楚“要解决什么问题”，不要只写一句模糊描述。

不推荐：

```text
优化购物车
```

推荐：

```text
修复购物车批量删除时空集合导致 SQL 异常的问题；当 ids 为空时直接返回，不执行删除 SQL。
```

---

### 2.2 允许修改文件

必须写精确路径或明确 glob。

推荐：

```text
cart-service/src/main/java/com/hmall/cart/service/impl/CartServiceImpl.java
hmall-nginx/html/cart.html
hmall-nginx/html/js/cart.js
```

不推荐：

```text
购物车相关文件
后端代码
前端页面
```

---

### 2.3 禁止修改文件

用于明确限制 Agent 不要乱动。

例子：

```text
禁止修改：
1. order-service/**
2. user-service/**
3. application.yml
4. 数据库脚本
5. 公共 DTO 和 Feign Client
```

---

### 2.4 是否允许新增文件

默认写“否”。

只有确实需要新增组件、页面、脚本、测试文件时，才写“是”。

```text
是否允许新增文件：否
```

如果允许新增，必须写位置：

```text
是否允许新增文件：是
允许新增的位置：hmall-nginx/html/js/**
```

---

### 2.5 是否允许修改接口

默认写“否”。

如果 Agent 要改 Controller 路径、参数、响应字段、DTO、Feign Client，就属于接口变更。

```text
是否允许修改接口：否
```

如果允许，必须写清楚：

```text
是否允许修改接口：是
接口说明：GET /addresses/{id} 查询不到时返回统一错误响应，不改变请求路径和参数。
```

---

### 2.6 是否允许修改数据库

默认写“否”。

如果涉及表、字段、索引、初始化数据、SQL 脚本，必须写“是”并说明。

```text
是否允许修改数据库：否
```

---

### 2.7 是否允许修改配置

默认写“否”。

如果涉及 `application.yml`、Nacos、Gateway、Docker、Nginx 等配置，必须写“是”并说明。

```text
是否允许修改配置：否
```

---

### 2.8 必须运行的验证

至少写一种。

常用验证：

```text
git diff --name-only main...HEAD
git diff --check
mvn test
mvn clean package
启动对应服务
Postman / 浏览器手测接口
浏览器打开页面并测试主要流程
统一运行电脑 pull main 后运行验证
```

如果本机跑不了，必须写：

```text
本机无法验证，原因：xxx
需要在统一运行电脑补测：是
```

---

## 3. 发给 Agent 的标准开工提示词

复制下面内容，填好后发给 Agent。

```text
你是 hmall 企业实训项目的 Vibe Coding Agent。

请严格按以下任务边界工作。没有明确允许的内容，不要修改。

任务ID：
任务名称：
任务目标：

允许修改文件：
1. 
2. 

禁止修改文件：
1. 
2. 

是否允许新增文件：是 / 否
允许新增的位置：

是否允许修改接口：是 / 否
接口限制：

是否允许修改数据库：是 / 否
数据库限制：

是否允许修改配置：是 / 否
配置限制：

必须运行的验证：
1. 
2. 

特别要求：
1. 一次只做当前任务。
2. 不要顺手重构无关代码。
3. 不要修改未列入允许范围的文件。
4. 如果认为必须修改额外文件，先停止并说明原因。
5. 如果遇到文件锁、Git 冲突、接口冲突，先停止，不要自行覆盖。
6. 编码前先输出计划：你理解的目标、计划修改文件、不会修改的内容、验证方式。
```

---

## 4. 认领任务时填写到协作文档

### 4.1 任务看板

```text
任务ID：
任务名称：
状态：IN_PROGRESS
负责人：
Agent ID：
分支：feature/{任务ID}-{说明}
允许修改范围：
验证方式：
更新时间：YYYY-MM-DD HH:mm:ss
```

### 4.2 文件锁

```text
任务ID：
Agent ID：
文件或目录：
开始时间：YYYY-MM-DD HH:mm:ss
过期时间：YYYY-MM-DD HH:mm:ss
状态：ACTIVE
说明：
```

文件锁必须写精确路径，例如：

```text
user-service/src/main/java/com/hmall/user/controller/AddressController.java
cart-service/src/main/java/com/hmall/cart/service/impl/CartServiceImpl.java
hmall-nginx/html/**
```

---

## 5. Agent 修改完成后，人必须检查

提交前必须执行：

```shell
git diff --name-only main...HEAD
```

检查：

- [ ] 是否只改了允许修改文件。
- [ ] 是否出现未授权新增文件。
- [ ] 是否误改其他模块。
- [ ] 是否修改接口 / DTO / DB / 配置。
- [ ] 是否出现大范围格式化。
- [ ] 是否提交了 target、node_modules、日志、IDE 配置、临时文件。
- [ ] 是否完成必须运行的验证。

如果不符合，不能提交，先让 Agent 撤回或缩小改动。

---

## 6. 收工交接填写

```text
任务ID：
负责人：
Agent ID：
开发分支：

完成内容：
1. 
2. 

修改文件：
1. 
2. 

测试结果：
1. 
2. 

PR / 提交 / 分支：
合入 main：未合入 / 已合入
服务器运行：未运行 / 已运行 / 不涉及

遗留问题：
下一步：
文件锁：RELEASED / ACTIVE / EXPIRED
```

---

## 7. 最小执行标准

每个任务至少做到：

```text
1. 开工前填任务边界。
2. Agent 编码前先输出计划。
3. claim push 成功后再编码。
4. Agent 只改允许文件。
5. 提交前看 git diff --name-only。
6. 收工前写交接记录。
```
---

## 6. 负责人合入检查表

合入 `main` 前，负责人至少检查下面内容。

```text
任务ID：
分支名：
提交人：

1. 修改文件是否都在允许范围内：是 / 否
2. 是否和 ACTIVE 文件锁冲突：是 / 否
3. 是否误提交 IDE 配置、target、node_modules、日志、临时文件：是 / 否
4. 是否修改接口 / DTO / 数据库 / 配置：是 / 否
5. 如果修改了，是否已经在任务记录中说明：是 / 否 / 不涉及
6. 是否有测试或验证记录：是 / 否
7. 是否填写交接记录：是 / 否
8. 是否可以合入 main：是 / 否

检查人：
检查时间：
```

推荐检查命令：

```shell
git fetch origin
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD
```

如果任意一项不确定，不要合入 `main`，先让任务负责人补充说明或修改。

