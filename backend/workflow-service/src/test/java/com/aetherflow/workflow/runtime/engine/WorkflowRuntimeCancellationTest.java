package com.aetherflow.workflow.runtime.engine;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

import com.aetherflow.common.dto.*;
import com.aetherflow.workflow.http.HttpJsonRequestService;
import com.aetherflow.workflow.ingestion.url.UrlIngestionProperties;
import com.aetherflow.workflow.node.*;
import com.aetherflow.workflow.node.code.CodeExecutionRuntime;
import com.aetherflow.workflow.node.executor.*;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.node.validation.WorkflowNodeConfigValidator;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.*;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

// 受控替身，不创建 HTTP 客户端，不执行用户 Python，不连接数据库。
class WorkflowRuntimeCancellationTest {
    static Map<String, Object> definition(String kind) {
        var d = new LinkedHashMap<String, Object>(Map.of("formatVersion", 1, "id", "review-node", "version", "1.0.0", "name", "review", "kind", kind,
                "inputs", List.of(Map.of("name", "count", "type", "NUMBER", "defaultValue", 4)), "fields", List.of(),
                "outputs", List.of(Map.of("name", "reviewResult", "type", "NUMBER", "required", true, "path", "/total"))));
        if (kind.equals("API")) d.put("request", Map.of("method", "POST", "url", "https://example.com/api", "headers", Map.of(), "body", Map.of("count", "{{inputs.count}}")));
        else d.put("code", "def main(payload): return {'total': 8}");
        return d;
    }
    static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        var n = new WorkflowNodeDTO(); n.setNodeId(id); n.setNodeType(type); n.setDisplayName(id); n.setConfig(config); return n;
    }
    static class FakeHttp extends HttpJsonRequestService {
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), finished = new CountDownLatch(1);
        final boolean block; final AtomicBoolean interrupted = new AtomicBoolean(); Object body;
        FakeHttp(boolean block) { super(new UrlIngestionProperties(), null, new ObjectMapper(), null); this.block = block; }
        @Override public Response request(String url, String method, Object body, boolean hasBody, Map<String, String> headers) {
            this.body = body; entered.countDown();
            if (block) try { if (!release.await(4, TimeUnit.SECONDS)) throw new IllegalStateException("probe timeout"); }
            catch (InterruptedException e) { interrupted.set(true); Thread.currentThread().interrupt(); throw new IllegalStateException("interrupted"); }
            finally { finished.countDown(); }
            return new Response(200, Map.of("total", 8), "", true, "");
        }
    }
    static class FakeCode implements CodeExecutionRuntime {
        final boolean failFirst; final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), retried = new CountDownLatch(1), finished = new CountDownLatch(1);
        final AtomicBoolean interrupted = new AtomicBoolean();
        FakeCode(boolean failFirst) { this.failFirst = failFirst; }
        @Override public CodeExecutionResult execute(String language, String code, Object input, int timeout, int bytes) {
            int call = calls.incrementAndGet(); entered.countDown();
            if (failFirst && call == 1) {
                try { if (!release.await(4, TimeUnit.SECONDS)) throw new IllegalStateException("probe timeout"); }
                catch (InterruptedException e) { interrupted.set(true); Thread.currentThread().interrupt(); throw new IllegalStateException("interrupted"); }
                finally { finished.countDown(); }
                throw new IllegalStateException("controlled runtime failure after cancellation");
            }
            if (call > 1) retried.countDown();
            return new CodeExecutionResult(Map.of("total", 8), "", 1, false);
        }
    }
    static CodeExecutionNodeExecutor codeExecutor(FakeCode runtime) {
        var p = new WorkflowNodeProperties(); p.setCodeExecutionEnabled(true); p.setCodeRuntimeIsolationConfirmed(true);
        return new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), p, runtime);
    }
    static WorkflowRuntimeRequest request(String kind, boolean downstream, RetryPolicy retry) throws Exception {
        var config = new LinkedHashMap<String, Object>(Map.of("customDefinition", definition(kind), "customInputs", Map.of(), "customValues", Map.of(), "inputBindings", Map.of(), "nextNodes", downstream ? List.of("consumer") : List.of()));
        var nodes = new ArrayList<WorkflowNodeDTO>();
        nodes.add(node("custom", kind.equals("API") ? "HTTP_REQUEST" : "CODE", config));
        if (downstream) nodes.add(node("consumer", "CONSUMER", Map.of("nextNodes", List.of())));
        var json = new ObjectMapper();
        for (var n : nodes) {
            n.setConfig(json.readValue(json.writeValueAsBytes(n.getConfig()), Map.class));
            if (!WorkflowNodeConfigValidator.validate(n, List.of()).isEmpty()) throw new AssertionError("save config rejected");
        }
        var d = new WorkflowDefinitionDTO(); d.setName("review"); d.setNodes(nodes);
        var configs = new LinkedHashMap<String, Object>(); nodes.forEach(n -> configs.put(n.getNodeId(), n.getConfig()));
        return new WorkflowRuntimeRequest("review-" + kind + "-" + downstream, "review-trace", "review-task", d,
                Map.of(WorkflowNodeContextKeys.NODE_CONFIGS, configs), retry);
    }
    static WorkflowRuntimeEngine engine(AtomicBoolean cancelled, List<RuntimeEvent> events, NodeExecutor... executors) {
        return new WorkflowRuntimeEngine(new NodeRegistry(List.of(executors)), new RuntimeStateMachine(), events::add, RuntimeSleeper.noop(),
                RuntimeSnapshotRepository.noop(), WorkflowRuntimeLock.noop(), workflowId -> cancelled.get());
    }
    static void positiveFlow(String kind) throws Exception {
        var http = new FakeHttp(false); var runtime = new FakeCode(false); var consumed = new AtomicBoolean();
        NodeExecutor consumer = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("CONSUMER"); }
            public NodeResult execute(WorkflowContext c) { if (!Objects.equals(c.variables().get("reviewResult"), 8)) throw new AssertionError("output wiring"); consumed.set(true); return NodeResult.success(Map.of()); }
        };
        var executor = kind.equals("API") ? new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper()) : codeExecutor(runtime);
        var result = engine(new AtomicBoolean(), new CopyOnWriteArrayList<>(), executor, consumer).execute(request(kind, true, RetryPolicy.none()));
        if (result.runtimeState() != RuntimeState.SUCCESS || !consumed.get()) throw new AssertionError("flow not completed");
        if (kind.equals("API") && !Objects.equals(http.body, Map.of("count", 4))) throw new AssertionError("typed body");
        System.out.println("POSITIVE " + kind + " JSON-config-validation -> engine -> downstream: PASS (controlled fake only)");
    }
    static void cancellation() throws Exception {
        var cancelled = new AtomicBoolean(); var http = new FakeHttp(true);
        var events = new CopyOnWriteArrayList<RuntimeEvent>();
        var request = request("API", false, RetryPolicy.none());
        var engine = engine(cancelled, events, new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper()));
        var run = CompletableFuture.supplyAsync(() -> engine.execute(request));
        try {
            if (!http.entered.await(2, TimeUnit.SECONDS)) throw new AssertionError("API not entered");
            cancelled.set(true); var snapshot = run.get(2, TimeUnit.SECONDS);
            if (snapshot.runtimeState() != RuntimeState.CANCELLED) throw new AssertionError("not cancelled");
            if (!http.finished.await(2, TimeUnit.SECONDS) || !http.interrupted.get()) throw new AssertionError("CANCELLED 必须中断在途 API 等待");
        } finally { http.release.countDown(); http.finished.await(2, TimeUnit.SECONDS); }
    }
    static void codeRetriesAfterCancellation() throws Exception {
        var cancelled = new AtomicBoolean(); var runtime = new FakeCode(true); var events = new CopyOnWriteArrayList<RuntimeEvent>();
        var request = request("CODE", false, RetryPolicy.of(3, Duration.ZERO, 1, Duration.ZERO));
        var engine = engine(cancelled, events, codeExecutor(runtime));
        var run = CompletableFuture.supplyAsync(() -> engine.execute(request));
        try {
            if (!runtime.entered.await(2, TimeUnit.SECONDS)) throw new AssertionError("code fake not entered");
            cancelled.set(true); var snapshot = run.get(2, TimeUnit.SECONDS);
            if (snapshot.runtimeState() != RuntimeState.CANCELLED) throw new AssertionError("not cancelled");
            if (!runtime.finished.await(2, TimeUnit.SECONDS) || !runtime.interrupted.get()) throw new AssertionError("CANCELLED 必须中断在途代码等待");
            runtime.release.countDown();
            boolean retry = runtime.retried.await(2, TimeUnit.SECONDS);
            System.out.println("OBSERVED CODE after CANCELLED snapshot then controlled runtime failure: dispatchedAgain=" + retry + ", calls=" + runtime.calls.get() + ", interrupted=" + runtime.interrupted.get());
            if (retry || runtime.calls.get() != 1) throw new AssertionError("cancelled node dispatched again");
        } finally { runtime.release.countDown(); }
    }
    @Test void controlledApiPublishesDownstream() throws Exception { positiveFlow("API"); }
    @Test void controlledCodePublishesDownstream() throws Exception { positiveFlow("CODE"); }
    @Test void cancellationInterruptsApiWorker() throws Exception { cancellation(); }
    @Test void cancellationInterruptsCodeWorkerWithoutRetry() throws Exception { codeRetriesAfterCancellation(); }

    @Test void completionCancellationDoesNotDispatchDownstreamOrPublishSuccess() throws Exception {
        var cancelled = new AtomicBoolean(); var runtime = new FakeCode(false); var consumers = new AtomicInteger();
        var events = new CopyOnWriteArrayList<RuntimeEvent>();
        NodeExecutor consumer = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("CONSUMER"); }
            public NodeResult execute(WorkflowContext context) { consumers.incrementAndGet(); return NodeResult.success(Map.of()); }
        };
        var engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(codeExecutor(runtime), consumer)), new RuntimeStateMachine(), event -> {
            events.add(event);
            if (event.eventType() == RuntimeEventType.NODE_COMPLETED && "custom".equals(event.nodeId())) cancelled.set(true);
        }, RuntimeSleeper.noop(), RuntimeSnapshotRepository.noop(), WorkflowRuntimeLock.noop(), id -> cancelled.get());
        var result = engine.execute(request("CODE", true, RetryPolicy.none()));
        assertThat(result.runtimeState()).isEqualTo(RuntimeState.CANCELLED);
        assertThat(consumers).hasValue(0); assertThat(runtime.calls).hasValue(1);
        assertThat(events).filteredOn(event -> event.eventType() == RuntimeEventType.WORKFLOW_CANCELLED).hasSize(1);
        assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.WORKFLOW_COMPLETED);
        // 最后一个节点刚完成时取消，也不能把本轮宣布为 SUCCESS。
        cancelled.set(false); events.clear();
        assertThat(engine.execute(request("CODE", false, RetryPolicy.none())).runtimeState()).isEqualTo(RuntimeState.CANCELLED);
    }

    @Test void failureCancelsOtherInFlightTasksWithoutPublishingTheirOutputs() throws Exception {
        var http = new FakeHttp(true); var events = new CopyOnWriteArrayList<RuntimeEvent>();
        NodeExecutor failure = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("FAIL"); }
            public NodeResult execute(WorkflowContext context) throws Exception {
                if (!http.entered.await(2, TimeUnit.SECONDS)) throw new AssertionError("受控 API 未进入等待");
                throw new IllegalStateException("受控并行失败");
            }
        };
        var request = request("API", false, RetryPolicy.none());
        request.definition().getNodes().add(node("failing", "FAIL", Map.of("nextNodes", List.of())));
        var engine = engine(new AtomicBoolean(), events, new HttpRequestNodeExecutor(new WorkflowNodeMetrics(), http, new ObjectMapper()), failure);
        try {
            assertThatThrownBy(() -> engine.execute(request)).hasMessageContaining("受控并行失败");
            assertThat(http.finished.await(2, TimeUnit.SECONDS)).isTrue(); assertThat(http.interrupted).isTrue();
            assertThat(events).noneMatch(event -> event.eventType() == RuntimeEventType.NODE_COMPLETED && "custom".equals(event.nodeId()));
            assertThat(events).filteredOn(event -> event.eventType() == RuntimeEventType.WORKFLOW_FAILED).hasSize(1);
        } finally { http.release.countDown(); }
    }

    @Test void cancellationDuringRetryDelayInterruptsWaitAndNeverDispatchesAgain() throws Exception {
        var cancelled = new AtomicBoolean(); var entered = new CountDownLatch(1); var finished = new CountDownLatch(1);
        var interrupted = new AtomicBoolean(); var calls = new AtomicInteger();
        NodeExecutor failingCode = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("CODE"); }
            public NodeResult execute(WorkflowContext context) { calls.incrementAndGet(); throw new IllegalStateException("受控失败，进入重试等待"); }
        };
        RuntimeSleeper sleeper = duration -> {
            entered.countDown();
            try { new CountDownLatch(1).await(); }
            catch (InterruptedException exception) { interrupted.set(true); throw exception; }
            finally { finished.countDown(); }
        };
        var engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(failingCode)), new RuntimeStateMachine(), event -> {}, sleeper,
                RuntimeSnapshotRepository.noop(), WorkflowRuntimeLock.noop(), id -> cancelled.get());
        var request = request("CODE", false, RetryPolicy.of(3, Duration.ofSeconds(10), 1, Duration.ofSeconds(10)));
        var run = CompletableFuture.supplyAsync(() -> engine.execute(request));
        try {
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue(); cancelled.set(true);
            assertThat(run.get(2, TimeUnit.SECONDS).runtimeState()).isEqualTo(RuntimeState.CANCELLED);
            assertThat(finished.await(2, TimeUnit.SECONDS)).isTrue(); assertThat(interrupted).isTrue(); assertThat(calls).hasValue(1);
        } finally { cancelled.set(true); run.cancel(true); }
    }
}
