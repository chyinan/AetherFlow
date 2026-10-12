// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { nextTick, computed, defineComponent, h, isProxy } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach } from 'vitest';
import { useWorkflowStore } from '@/stores/workflowStore';
const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, validateCopilotDraft, editCanvas, validateCanvasEdit } = vi.hoisted(() => ({
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    refreshSnapshot: vi.fn(),
    stream: vi.fn(),
    planWorkflow: vi.fn(),
    validateCopilotDraft: vi.fn(),
    editCanvas: vi.fn(),
    validateCanvasEdit: vi.fn(),
}));
vi.mock('@/services/api/copilotApi', () => ({
    copilotApi: { listConversations, listMessages, stream, planWorkflow, editCanvas },
}));
vi.mock('@/services/api/workflowApi', () => ({
    workflowApi: { validateCopilotDraft, validateCanvasEdit },
}));
vi.mock('@/services/api/modelApi', () => ({
    modelApi: { refreshSnapshot },
}));
import { i18n } from '@/i18n';
import AICopilotPanel from './AICopilotPanel.vue';
import { buildWorkflowPlannerContext } from '@/services/copilot/workflowCopilotActions';
import { nodeTemplates } from '@/services/mock/workflowMock';
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan';
function panelContext(workflowId = 'workflow-current', editRevision = 3) {
    return {
        workflowId,
        workflowName: 'Workflow notes',
        backendDefinitionId: null,
        backendVersion: null,
        editRevision,
        projectId: null,
        selectedNodeId: null,
        nodes: [],
        edges: [],
        templates: nodeTemplates.map((template) => ({ ...template, availability: { available: true, reason: null } })),
    };
}
function readyMediaPlan(): CopilotWorkflowPlan {
    return {
        status: 'READY',
        requirements: {
            goal: 'Summarize a meeting recording', inputKind: 'MEDIA_FILE',
            inputDescription: 'Audio or video supplied at run time', outputFormat: 'Markdown',
            language: 'English', audience: 'Project team', instruction: 'Highlight decisions and owners',
            constraints: ['Keep action owners'],
        },
        recipe: 'MEDIA_SUMMARY',
        steps: ['Accept media input', 'Transcribe it', 'Summarize and export'],
        explanation: 'I have a media summary plan ready to review.',
        clarifyingQuestion: null,
        assumptions: ['The file will be selected when the workflow runs'],
    };
}
function planMessage(context: ReturnType<typeof panelContext>, plan: CopilotWorkflowPlan, id = 'msg-plan-ready') {
    return {
        id, conversationId: 'conv-1', role: 'assistant' as const,
        content: plan.explanation, createdAt: '22:30', plan,
        planBaseRevision: context.editRevision, planBaseVersion: null,
        planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
    };
}
const ready = { structurallyValid: true, runtimeReady: true, issues: [] };
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
    window.sessionStorage.clear();
    listConversations.mockReset().mockResolvedValue([]);
    listMessages.mockReset().mockResolvedValue([]);
    refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] });
    validateCopilotDraft.mockReset().mockResolvedValue(ready);
    planWorkflow.mockReset();
});
afterEach(() => wrapper?.unmount());
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
async function setup() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.applyWorkflowDefinition({ id: 'workflow-a', name: 'Meeting notes', nodes: [], edges: [] });
    store.templates = nodeTemplates.map(t => ({ ...t, availability: { available: true, reason: null } }));
    const context = computed(() => ({ workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: null, selectedNodeId: null, nodes: store.nodes, edges: store.edges, templates: store.templates }));
    let id = 0;
    planWorkflow.mockImplementation(async () => planMessage(context.value as any, readyMediaPlan(), `plan-${++id}`));
    const apply = vi.fn(request => store.applyCopilotWorkflowDraft(request));
    wrapper = mount(defineComponent({ setup: () => () => h(AICopilotPanel, { context: context.value, applyWorkflowDraft: apply }) }), { global: { plugins: [pinia, i18n] } });
    await flushPromises();
    return { store, apply };
}
function button(key: string) { const b = wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key)); expect(b, key).toBeDefined(); return b!; }
async function preview() { await button('copilot.quickDraftWorkflow').trigger('click'); await flushPromises(); }
it('连续应用仅修改真实画布一次，并允许撤销重做', async () => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockImplementationOnce(() => pending.promise);
    const b = button('copilot.planner.apply');
    await b.trigger('click');
    await b.trigger('click');
    expect(validateCopilotDraft).toHaveBeenCalledTimes(2);
    expect(store.nodes).toHaveLength(0);
    pending.resolve(ready);
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
    expect(store.historyPast).toHaveLength(1);
    expect(store.undo()).toBe(true);
    expect(store.nodes).toHaveLength(0);
    expect(store.redo()).toBe(true);
    expect(store.nodes).toHaveLength(7);
});
it('最终校验期间手动编辑使旧方案失效，再生成方案可以恢复', async () => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockImplementationOnce(() => pending.promise);
    await button('copilot.planner.apply').trigger('click');
    const manual = store.addNodeFromTemplate(store.templates.find(t => t.kind === 'start')!, { x: 1, y: 2 })!;
    await nextTick();
    pending.resolve(ready);
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(store.nodes.map(n => n.id)).toEqual([manual.id]);
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.planner.stale'));
    await preview();
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
});
it.each(['navigate', 'new-chat', 'leave-mode', 'unmount'])('最终校验期间 %s 隔离迟到成功', async (action) => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockImplementationOnce(() => pending.promise);
    await button('copilot.planner.apply').trigger('click');
    if (action === 'navigate') {
        store.applyWorkflowDefinition({ id: 'workflow-b', name: 'Other', nodes: [], edges: [] });
        await nextTick();
    }
    if (action === 'new-chat')
        await button('copilot.newConversation').trigger('click');
    if (action === 'leave-mode')
        await button('copilot.planner.leaveMode').trigger('click');
    if (action === 'unmount') {
        wrapper!.unmount();
        wrapper = undefined;
    }
    pending.resolve(ready);
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(store.nodes).toHaveLength(0);
    if (action !== 'unmount') {
        await preview();
        await button('copilot.planner.apply').trigger('click');
        await flushPromises();
        expect(apply).toHaveBeenCalledTimes(1);
        expect(store.nodes).toHaveLength(7);
    }
});
it('最终校验网络失败后重新生成与应用可以恢复', async () => {
    const { store, apply } = await setup();
    await preview();
    validateCopilotDraft.mockRejectedValueOnce(new Error('Temporary validation failure'));
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(store.nodes).toHaveLength(0);
    await preview();
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
});
it('真实面板产生的代理图可以应用，过期的重复请求不污染历史', async () => {
    const { store, apply } = await setup();
    await preview();
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    const request = apply.mock.calls[0]![0];
    expect(isProxy(request.nodes)).toBe(true);
    expect(isProxy(request.edges)).toBe(true);
    expect(apply.mock.results[0]).toEqual({ type: 'return', value: true });
    expect(store.nodes).toHaveLength(7);
    expect(store.historyPast).toHaveLength(1);
    expect(store.applyCopilotWorkflowDraft(request)).toBe(false);
    expect(store.historyPast).toHaveLength(1);
});
it('对照：关闭后不再触发迟到应用', async () => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockImplementationOnce(() => pending.promise);
    await button('copilot.planner.apply').trigger('click');
    wrapper!.unmount();
    wrapper = undefined;
    pending.resolve(ready);
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(store.historyPast).toHaveLength(0);
});
