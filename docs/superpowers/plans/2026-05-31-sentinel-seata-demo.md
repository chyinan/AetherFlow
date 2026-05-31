# Sentinel Seata Demo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sentinel Dashboard show business-service traffic and make Seata participate in a real workflow cross-service write path.

**Architecture:** Keep Sentinel as the existing web/gateway/resource protection layer and add a demo traffic script. Put the Seata global transaction boundary on `workflow-service` workflow instance startup, then configure `task-service` and `file-service` as Seata resource managers using `aetherflow_tx_group`.

**Tech Stack:** Spring Boot 3, Spring Cloud Alibaba Sentinel, Spring Cloud Alibaba Seata, OpenFeign, Maven, PowerShell.

---

### Task 1: Seata Boundary Contract

**Files:**
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowServiceImplTest.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`

- [ ] **Step 1: Write a failing test that verifies `startInstance` owns a Seata global transaction**

Add a reflection assertion to `WorkflowServiceImplTest` that checks `startInstance(Long, StartWorkflowRequest)` has `@GlobalTransactional`.

- [ ] **Step 2: Run the focused workflow test and confirm it fails**

Run: `mvn -pl backend/workflow-service -Dtest=WorkflowServiceImplTest test`

- [ ] **Step 3: Add `@GlobalTransactional` to `WorkflowServiceImpl.startInstance`**

Import `io.seata.spring.annotation.GlobalTransactional` and annotate the method with a short name such as `aetherflow-start-workflow-instance`.

- [ ] **Step 4: Re-run the focused workflow test and confirm it passes**

Run: `mvn -pl backend/workflow-service -Dtest=WorkflowServiceImplTest test`

### Task 2: Seata Participant Configuration

**Files:**
- Modify: `backend/task-service/pom.xml`
- Modify: `backend/file-service/pom.xml`
- Modify: `backend/task-service/src/main/resources/application.yml`
- Modify: `backend/task-service/src/main/resources/application-prod.yml`
- Modify: `backend/file-service/src/main/resources/application.yml`
- Modify: `backend/file-service/src/main/resources/application-prod.yml`

- [ ] **Step 1: Write configuration contract checks where existing module tests can load resources**

Add lightweight assertions to existing service tests or a new small test class that reads application YAML and checks for `seata.enabled`, `tx-service-group: aetherflow_tx_group`, and `SEATA_ADDR`.

- [ ] **Step 2: Run the focused tests and confirm they fail before config is present**

Run focused Maven tests for `task-service` and `file-service`.

- [ ] **Step 3: Add Seata starter dependencies**

Add `spring-cloud-starter-alibaba-seata` to `task-service` and `file-service`.

- [ ] **Step 4: Add Seata YAML config**

Use the same structure as `workflow-service`: `enabled`, `application-id`, `tx-service-group`, `service.vgroup-mapping`, and `service.grouplist`.

- [ ] **Step 5: Re-run focused tests**

Run targeted module tests and then a compile/test pass for changed modules.

### Task 3: Sentinel Demo Traffic Script

**Files:**
- Create: `scripts/aetherflow-demo-observability.ps1`

- [ ] **Step 1: Write a PowerShell script syntax/contract check**

Use `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aetherflow-demo-observability.ps1 -Help` as the smoke command.

- [ ] **Step 2: Create the script**

The script should accept `-BaseUrl`, `-Rounds`, and optional credentials, log in or register if needed, call Gateway status, auth status, AI status, task metrics, workflow node/metrics endpoints, and print the Sentinel and Seata dashboard URLs.

- [ ] **Step 3: Run script help and a low-round dry run if the demo host is reachable**

Run help locally. If `192.168.101.68:8080` is reachable, run one round and report which endpoints returned 2xx/4xx.

### Task 4: Verification

**Files:**
- Modified module files from previous tasks.

- [ ] **Step 1: Run targeted Maven tests**

Run workflow, task, and file-service focused tests.

- [ ] **Step 2: Run script help check**

Run the PowerShell script with `-Help`.

- [ ] **Step 3: Summarize manual demo steps**

Tell the user to run the demo script, then check Sentinel app names and Seata transaction records while triggering workflow startup.
