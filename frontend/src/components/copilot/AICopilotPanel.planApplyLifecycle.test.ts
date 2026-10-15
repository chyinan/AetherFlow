// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
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
import { type WorkflowCopilotSnapshot, buildWorkflowPlannerContext } from '@/services/copilot/workflowCopilotActions';
import { nodeTemplates } from '@/services/mock/workflowMock';
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan';
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
function planMessage(context: WorkflowCopilotSnapshot, plan: CopilotWorkflowPlan, id = 'msg-plan-ready') {
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
    stream.mockReset();
    editCanvas.mockReset();
    validateCanvasEdit.mockReset();
});
afterEach(() => wrapper?.unmount());
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((r, e) => { resolve = r; reject = e }); return { promise, resolve, reject }; }
async function setup() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.applyWorkflowDefinition({ id: 'workflow-a', name: 'Meeting notes', nodes: [], edges: [] });
    store.templates = nodeTemplates.map(t => ({ ...t, availability: { available: true, reason: null } }));
    const context = computed(() => ({ workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: null, selectedNodeId: null, nodes: store.nodes, edges: store.edges, templates: store.templates }));
    let id = 0;
    planWorkflow.mockImplementation(async () => planMessage(context.value, readyMediaPlan(), `plan-${++id}`));
    const apply = vi.fn(request => store.applyCopilotWorkflowDraft(request));
    wrapper = mount(defineComponent({ setup: () => () => h(AICopilotPanel, { context: context.value, applyWorkflowDraft: apply }) }), { global: { plugins: [pinia, i18n] } });
    await flushPromises();
    return { store, apply };
}
function button(key: string) { const b = wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key)); expect(b, key).toBeDefined(); return b!; }
async function preview() { await button('copilot.quickDraftWorkflow').trigger('click'); await flushPromises(); }

it.each([
    ['new-conversation', 'success'], ['new-conversation', 'failure'],
    ['workflow-switch', 'success'], ['workflow-switch', 'failure'],
    ['return-to-workflow', 'success'], ['return-to-workflow', 'failure'],
] as const)('%s 后应用等待期间旧请求迟到 %s 不解锁重复应用', async (action, outcome) => {
    const { store, apply } = await setup();
    await preview();
    const oldApply = deferred<typeof ready>();
    validateCopilotDraft.mockReturnValueOnce(oldApply.promise);
    await button('copilot.planner.apply').trigger('click');
    if (action === 'new-conversation') await button('copilot.newConversation').trigger('click');
    else {
        store.applyWorkflowDefinition({ id: 'workflow-b', name: '第二个工作流', nodes: [], edges: [] });
        await flushPromises();
        if (action === 'return-to-workflow') {
            store.applyWorkflowDefinition({ id: 'workflow-a', name: 'Meeting notes', nodes: [], edges: [] });
            await flushPromises();
        }
    }
    await preview();
    const newApply = deferred<typeof ready>();
    validateCopilotDraft.mockReturnValueOnce(newApply.promise);
    await button('copilot.planner.apply').trigger('click');
    expect(validateCopilotDraft).toHaveBeenCalledTimes(4);
    if (outcome === 'success') oldApply.resolve(ready);
    else oldApply.reject(new Error('旧会话校验失败'));
    await flushPromises();
    expect.soft(button('copilot.planner.apply').attributes('disabled')).toBeDefined();
    await button('copilot.planner.apply').trigger('click');
    expect.soft(validateCopilotDraft).toHaveBeenCalledTimes(4);
    expect.soft(apply).not.toHaveBeenCalled();
    newApply.resolve(ready);
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
    expect(store.historyPast).toHaveLength(1);
    expect.soft(wrapper!.text()).toContain(i18n.global.t('copilot.planner.applied'));
    expect.soft(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.stale'));
    expect.soft(wrapper!.text()).not.toContain('旧会话校验失败');
    expect(store.undo()).toBe(true);
    expect(store.nodes).toHaveLength(0);
    expect(store.redo()).toBe(true);
    expect(store.nodes).toHaveLength(7);
});

it('同一会话连续点击保持单飞，当前请求失败后重新规划可以恢复', async () => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockReturnValueOnce(pending.promise);
    await button('copilot.planner.apply').trigger('click');
    await button('copilot.planner.apply').trigger('click');
    expect(validateCopilotDraft).toHaveBeenCalledTimes(2);
    expect(apply).not.toHaveBeenCalled();
    pending.reject(new Error('当前校验暂时失败'));
    await flushPromises();
    expect(wrapper!.text()).toContain('当前校验暂时失败');
    expect(store.nodes).toHaveLength(0);
    expect(store.historyPast).toHaveLength(0);
    await preview();
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
    expect(store.historyPast).toHaveLength(1);
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.planner.applied'));
});

it.each(['success', 'failure'] as const)('新会话应用已经完成时旧请求迟到 %s 不更改结果', async outcome => {
    const { store, apply } = await setup();
    await preview();
    const pending = deferred<typeof ready>();
    validateCopilotDraft.mockReturnValueOnce(pending.promise);
    await button('copilot.planner.apply').trigger('click');
    await button('copilot.newConversation').trigger('click');
    await preview();
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    const applied = JSON.stringify([store.nodes, store.edges, store.historyPast, store.editRevision, store.dirty]);
    if (outcome === 'success') pending.resolve(ready);
    else pending.reject(new Error('旧会话失败不应出现'));
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([store.nodes, store.edges, store.historyPast, store.editRevision, store.dirty])).toBe(applied);
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.planner.applied'));
    expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.stale'));
    expect(wrapper!.text()).not.toContain('旧会话失败不应出现');
});
