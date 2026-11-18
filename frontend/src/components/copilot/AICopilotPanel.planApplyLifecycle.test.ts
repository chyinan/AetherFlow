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
async function setup(withCanvasEditing = false) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.applyWorkflowDefinition({ id: 'workflow-a', name: 'Meeting notes', nodes: [], edges: [] });
    store.templates = nodeTemplates.map(t => ({ ...t, availability: { available: true, reason: null } }));
    const context = computed(() => ({ workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: null, selectedNodeId: null, nodes: store.nodes, edges: store.edges, templates: store.templates }));
    let id = 0;
    planWorkflow.mockImplementation(async () => planMessage(context.value, readyMediaPlan(), `plan-${++id}`));
    const apply = vi.fn(request => store.applyCopilotWorkflowDraft(request));
    wrapper = mount(defineComponent({ setup: () => () => h(AICopilotPanel, {
        context: context.value, applyWorkflowDraft: apply,
        ...(withCanvasEditing ? { applyCanvasEdit: vi.fn(() => false) } : {}),
    }) }), { global: { plugins: [pinia, i18n] } });
    await flushPromises();
    return { store, apply, context };
}
function button(key: string) { const b = wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key)); expect(b, key).toBeDefined(); return b!; }
async function preview() { await button('copilot.quickDraftWorkflow').trigger('click'); await flushPromises(); }

it('中文媒体需求澄清后，最终校验返回 503 可以重试同一预览并且只应用一次', async () => {
    const { store, apply, context } = await setup(true);
    const plan: CopilotWorkflowPlan = {
        ...readyMediaPlan(),
        requirements: {
            ...readyMediaPlan().requirements,
            goal: '把中文视频转录后生成三条摘要',
            inputDescription: '运行时选择中文视频',
            language: '中文',
            instruction: '用中文生成三条摘要',
        },
        explanation: '请预览媒体摘要方案。',
    };
    planWorkflow.mockResolvedValueOnce(planMessage(context.value, {
        ...plan, status: 'NEEDS_CLARIFICATION', recipe: null, steps: [],
        requirements: { ...plan.requirements, inputKind: 'UNKNOWN', inputDescription: '' },
        clarifyingQuestion: '输入是本地媒体文件，还是公开网址？',
        explanation: '请补充输入类型。',
    }, 'needs-input')).mockResolvedValueOnce(planMessage(context.value, plan));
    await button('copilot.editor.chatMode').trigger('click');
    await preview();
    expect(wrapper!.text()).toContain('输入是本地媒体文件，还是公开网址？');
    expect(apply).not.toHaveBeenCalled();
    const text = '帮我搭一个工作流：输入中文视频，转录后生成三条摘要';
    await wrapper!.get('form textarea').setValue(text);
    await wrapper!.get('form').trigger('submit');
    await flushPromises();
    expect(planWorkflow).toHaveBeenLastCalledWith(text, expect.objectContaining({ conversationId: 'conv-1' }));
    expect(wrapper!.text()).toContain('请预览媒体摘要方案。');
    expect(validateCopilotDraft).toHaveBeenCalledTimes(1);
    expect(store.nodes).toHaveLength(0);

    validateCopilotDraft.mockRejectedValueOnce({ status: 503, message: '工作流服务暂不可用' });
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('工作流服务暂不可用');
    expect(apply).not.toHaveBeenCalled();
    expect(store.nodes).toHaveLength(0);

    const retry = deferred<typeof ready>();
    validateCopilotDraft.mockReturnValueOnce(retry.promise);
    const retryButton = button('copilot.planner.retryApply');
    await retryButton.trigger('click');
    expect(retryButton.attributes('disabled')).toBeDefined();
    await retryButton.trigger('click');
    expect(validateCopilotDraft).toHaveBeenCalledTimes(3);
    expect(validateCopilotDraft.mock.calls[2]).toEqual(validateCopilotDraft.mock.calls[1]);
    expect(planWorkflow).toHaveBeenCalledTimes(2);
    expect(apply).not.toHaveBeenCalled();
    retry.resolve(ready);
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(store.nodes.map(node => node.data.kind)).toEqual(['start', 'upload', 'ffmpeg', 'whisper', 'summary', 'export', 'output']);
    expect(store.nodes.find(node => node.data.kind === 'summary')?.data.config).toMatchObject({ prompt: '用中文生成三条摘要' });
    expect(store.historyPast).toHaveLength(1);
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.planner.applied'));
    expect(wrapper!.text()).not.toContain('工作流服务暂不可用');
});

it('同一预览重试仍需通过最终运行能力校验', async () => {
    const { store, apply } = await setup();
    await preview();
    validateCopilotDraft.mockRejectedValueOnce({ status: 503, message: '暂时无法校验' });
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();

    validateCopilotDraft.mockResolvedValueOnce({ structurallyValid: true, runtimeReady: false, issues: ['模型未就绪'] });
    await button('copilot.planner.retryApply').trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('模型未就绪');
    expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.retryApply'));
    expect(store.nodes).toHaveLength(0);
    expect(apply).not.toHaveBeenCalled();
});

it('最终校验返回不可重试的冲突时，仍要求重新规划', async () => {
    const { store, apply } = await setup();
    await preview();
    validateCopilotDraft.mockRejectedValueOnce({ status: 409, message: '工作流版本已经改变' });
    await button('copilot.planner.apply').trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('工作流版本已经改变');
    expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.retryApply'));
    expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.apply'));
    expect(store.nodes).toHaveLength(0);
    expect(apply).not.toHaveBeenCalled();
});

it.each(['校验失败前', '校验失败后'])('%s手动修改画布，不能重试旧预览', async (editTime) => {
    const { store, apply } = await setup();
    await preview();
    let rejectValidation!: (error: { status: number; message: string }) => void;
    validateCopilotDraft.mockReturnValueOnce(new Promise((_, reject) => { rejectValidation = reject; }));
    await button('copilot.planner.apply').trigger('click');
    const edit = () => store.addNodeFromTemplate(store.templates.find(template => template.kind === 'start')!, { x: 1, y: 2 });
    if (editTime === '校验失败前') edit();
    rejectValidation({ status: 503, message: '旧校验失败' });
    await flushPromises();
    if (editTime === '校验失败后') {
        await button('copilot.planner.retryApply');
        edit();
        await flushPromises();
    }
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.planner.stale'));
    expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.planner.retryApply'));
    expect(wrapper!.text()).not.toContain('旧校验失败');
    expect(store.nodes).toHaveLength(1);
    expect(apply).not.toHaveBeenCalled();
});

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
