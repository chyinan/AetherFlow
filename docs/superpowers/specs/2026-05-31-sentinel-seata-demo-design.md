# Sentinel and Seata Demo Integration Design

## Goal

Make the AetherFlow demo show meaningful Sentinel traffic and at least one real Seata global transaction, so the infrastructure panels are defensible during a mentor review.

## Scope

- Sentinel: keep the existing Dashboard and dependencies, and add a small traffic script that calls Gateway-routed APIs for `gateway-service`, `auth-service`, `workflow-service`, `task-service`, `ai-service`, and `file-service`.
- Seata: make `workflow-service` start a global transaction for workflow instance startup, and make `task-service` and `file-service` join as resource managers through the same `aetherflow_tx_group`.
- Demo evidence: add checks/scripts that generate traffic and exercise one cross-service write path instead of relying on empty dashboards.

## Architecture

Sentinel remains the runtime protection layer. Spring Cloud Alibaba Sentinel auto-protects web resources, while existing custom guards in Gateway, AI, and Task continue to load resource-specific rules. The demo script sends repeated requests through Gateway so the Dashboard shows application/resource traffic.

Seata is added only where the current domain already has a plausible cross-service write path. `workflow-service` owns the global transaction boundary when starting a workflow instance. `task-service` and `file-service` are configured as participants so writes they perform under a propagated XID can appear in Seata and roll back when the global transaction fails.

## Testing

- Add focused tests asserting the Seata annotations/configuration are present on the intended workflow boundary.
- Add configuration-contract tests for Seata settings on participant services where practical.
- Run targeted Maven tests for modified modules and a lightweight script syntax check.

## Demo Notes

For Sentinel, the expected evidence is application/resource traffic in the Dashboard after running the traffic script. For Seata, `TransactionInfo` may only show records while a global transaction is active or when an exception/rollback path is triggered; the demo should use the explicit cross-service path and mention that empty tables are normal when no global transaction is running.
