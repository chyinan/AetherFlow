// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach } from 'vitest';
import { useWorkflowStore } from '@/stores/workflowStore';
const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, validateCopilotDraft, editCanvas } = vi.hoisted(() => ({
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
const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/api/client/apiClient', () => ({ apiClient: { get, put, post }, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }));
import { workflowApi } from '@/services/api/workflowApi';
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
        planBaseRevision: context.editRevision, planBaseVersion: context.backendVersion,
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
async function setup() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    expect(await store.loadWorkflow('42')).toBe(true);
    store.templates = nodeTemplates.map(t => ({ ...t, availability: { available: true, reason: null } }));
    const context = computed(() => ({ workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: store.projectId, selectedNodeId: null, nodes: store.nodes, edges: store.edges, templates: store.templates }));
    let id = 0;
    planWorkflow.mockImplementation(async () => planMessage(context.value as any, readyMediaPlan(), `plan-${++id}`));
    const apply = vi.fn(request => store.applyCopilotWorkflowDraft(request));
    wrapper = mount(defineComponent({ setup: () => () => h(AICopilotPanel, { context: context.value, applyWorkflowDraft: apply }) }), { global: { plugins: [pinia, i18n] } });
    await flushPromises();
    return { store, apply };
}
function button(key: string) { const b = wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key)); expect(b, key).toBeDefined(); return b!; }
async function preview() { await button('copilot.quickDraftWorkflow').trigger('click'); await flushPromises(); }
const description = '保留给团队的流程用途和维护说明';
let entity: any;
beforeEach(() => {
    localStorage.clear();
    entity = { id: 42, name: 'Existing meeting workflow', description, projectId: 9, version: 7, status: 'DRAFT',
      definitionJson: JSON.stringify({ nodes: [{ nodeId: 'original-start', nodeType: 'START', displayName: 'Original', position: { x: 45, y: 96 }, config: { variables: {} } }] }) };
    get.mockReset().mockImplementation(async () => JSON.parse(JSON.stringify(entity)));
    post.mockReset().mockResolvedValue(ready);
    put.mockReset().mockImplementation(async (_url, body) => {
      // 模拟已核对的 Java updateVersioned：缺失的 description 绑定为 null 并直接写入。
      const wire = JSON.parse(JSON.stringify(body));
      entity = { ...entity, name: wire.name, description: wire.description ?? null, projectId: wire.projectId ?? entity.projectId,
        version: entity.version + 1, definitionJson: JSON.stringify(wire) };
      return JSON.parse(JSON.stringify(entity));
    });
});
it('已有工作流的方案应用、撤销重做、保存重开保留身份、项目、名称、版本和图', async () => {
    const { store, apply } = await setup();
    const metadata = () => [store.workflowId, store.workflowName, store.backendDefinitionId, store.backendVersion, store.projectId];
    const original = metadata();
    await preview();
    expect(post).toHaveBeenCalledWith('/workflows/drafts/validate', expect.objectContaining({ definitionId: 42, expectedVersion: 7 }), expect.anything());
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(7);
    expect(store.historyPast).toHaveLength(1);
    expect(metadata()).toEqual(original);
    const appliedIds = store.nodes.map(n => n.id);
    expect(store.undo()).toBe(true);
    expect(store.nodes.map(n => n.id)).toEqual(['original-start']);
    expect(metadata()).toEqual(original);
    expect(store.redo()).toBe(true);
    expect(store.nodes.map(n => n.id)).toEqual(appliedIds);
    expect(metadata()).toEqual(original);
    await store.saveCurrentWorkflow();
    expect(put).toHaveBeenCalledWith('/workflows/definitions/42', expect.objectContaining({name: original[1], projectId: 9, version: 7}), expect.anything());
    expect(store.backendVersion).toBe(8);
    expect(store.dirty).toBe(false);
    expect(store.undo()).toBe(true);
    expect(store.dirty).toBe(true);
    expect(store.redo()).toBe(true);
    expect(await store.loadWorkflow('42')).toBe(true);
    expect(store.nodes.map(n => n.id)).toEqual(appliedIds);
    expect(store.edges).toHaveLength(6);
    expect(metadata()).toEqual([original[0], original[1], 42, 8, 9]);
});
it.each([false, true])('已有说明应在保存重开后保留，应用方案=%s', async (applyPlan) => {
    expect((await workflowApi.getWorkflow('42')).description).toBe(description);
    const { store } = await setup();
    if (applyPlan) { await preview(); await button('copilot.planner.apply').trigger('click'); await flushPromises(); }
    await store.saveCurrentWorkflow();
    expect((await workflowApi.getWorkflow('42')).description).toBe(description);
});
it('请求载荷保留加载时已有的说明', async () => {
    const loaded = await workflowApi.getWorkflow('42');
    expect(loaded.description).toBe(description);
    const { store } = await setup();
    await store.saveCurrentWorkflow();
    const payload = put.mock.calls[0]![1];
    expect(payload.description).toBe(description);
    expect(JSON.parse(JSON.stringify(payload)).description).toBe(description);
});
it('对照：直接经真实 workflowApi 保存完整定义可以保留说明', async () => {
    const loaded = await workflowApi.getWorkflow('42');
    await workflowApi.saveWorkflow(loaded);
    expect(put.mock.calls[0]![1].description).toBe(description);
    expect((await workflowApi.getWorkflow('42')).description).toBe(description);
});
it('应用定义、模板、新建重置和重新加载均正确隔离说明', async () => {
    const { store } = await setup();
    expect(store.workflowDescription).toBe(description);
    const loaded = await workflowApi.getWorkflow('42');
    store.applyWorkflowDefinition({ ...loaded, description: '导入说明' }, true);
    expect(store.workflowDescription).toBe('导入说明');
    await store.saveCurrentWorkflow();
    expect(put.mock.calls.at(-1)![1].description).toBe('导入说明');
    store.useWorkflowTemplate({ ...loaded, description: '模板说明' });
    expect(store.workflowDescription).toBe('模板说明');
    store.resetToEmptyWorkflow();
    expect(store.workflowDescription).toBe('');
    store.applyWorkflowDefinition({ ...loaded, description: undefined });
    expect(store.workflowDescription).toBe('');
    expect(await store.loadWorkflow('42')).toBe(true);
    expect(store.workflowDescription).toBe('导入说明');
    expect(await store.loadWorkflow('new')).toBe(true);
    expect(store.workflowDescription).toBe('');
});
it('保存失败、重试及撤销重做均保留说明', async () => {
    const { store } = await setup();
    await preview(); await button('copilot.planner.apply').trigger('click'); await flushPromises();
    put.mockRejectedValueOnce(new Error('temporary save failure'));
    await expect(store.saveCurrentWorkflow()).rejects.toThrow('temporary save failure');
    expect(store.workflowDescription).toBe(description);
    expect(store.dirty).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.workflowDescription).toBe(description);
    expect(store.redo()).toBe(true);
    await store.saveCurrentWorkflow();
    expect(put.mock.calls[0]![1]).toEqual(put.mock.calls[1]![1]);
    expect(store.workflowDescription).toBe(description);
    expect(await store.loadWorkflow('42')).toBe(true);
    expect(store.workflowDescription).toBe(description);
});
