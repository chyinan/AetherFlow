const fs = require('fs')

const checks = [
  ['projectApi', 'frontend/src/services/api/projectApi.ts', /\.\.\/mock|services\/mock|mockProjects/],
  ['difyApi', 'frontend/src/services/api/difyApi.ts', /\.\.\/mock|services\/mock|mockKnowledge|mockMonitor|mockConversation/],
  ['settingsApi', 'frontend/src/services/api/settingsApi.ts', /\.\.\/mock|services\/mock|mockWorkspace|mockSettings|mockBilling|mockAudit/],
]

let failed = false

for (const [name, file, pattern] of checks) {
  const content = fs.readFileSync(file, 'utf8')
  if (pattern.test(content)) {
    console.error(`${name} still imports or returns frontend mock fixtures`)
    failed = true
  }
}

const router = fs.readFileSync('frontend/src/router/index.ts', 'utf8')
if (!/name:\s*'settings',[\s\S]*roles:\s*\[\s*'owner'\s*,\s*'operator'\s*\]/.test(router)) {
  console.error('settings route is not accessible to the default operator demo account')
  failed = true
}

const projectStore = fs.readFileSync('frontend/src/stores/projectStore.ts', 'utf8')
const projectsPage = fs.readFileSync('frontend/src/pages/projects/ProjectsPage.vue', 'utf8')
if (!/workflowApi\.listWorkflows\(\)/.test(projectStore) || /if \(this\.projects\.length > 0\)/.test(projectStore) || !/projectWorkflows/.test(projectStore)) {
  console.error('project store should refresh backend workflows and expose them for project dashboard metrics')
  failed = true
}

if (!/function openProject/.test(projectsPage) || !/router\.push\(`\/workflows\/\$/.test(projectsPage) || !/path:\s*'\/workflows\/new'/.test(projectsPage) || !/name:\s*project\.name/.test(projectsPage) || !/workflowsFor\(project\)/.test(projectsPage)) {
  console.error('projects page should open the first workflow editor or a new workflow from the project card')
  failed = true
}

const workflowStore = fs.readFileSync('frontend/src/stores/workflowStore.ts', 'utf8')
const workflowPage = fs.readFileSync('frontend/src/pages/workflows/WorkflowPage.vue', 'utf8')
if (!/initialName\?:\s*string/.test(workflowStore) || !/this\.workflowName\s*=\s*initialName\s*\|\|\s*workflow\.name/.test(workflowStore) || !/route\.query\.name/.test(workflowPage) || !/route\.query\.projectId/.test(workflowPage)) {
  console.error('new workflow editor should inherit the selected project name instead of showing Untitled Workflow')
  failed = true
}

const nodeInspector = fs.readFileSync('frontend/src/components/workflow/NodeInspector.vue', 'utf8')
if (!/selectedInputFile/.test(nodeInspector) || !/handleInputFileUpload/.test(nodeInspector) || !/workflow\.inspector\.inputFileTitle/.test(nodeInspector) || !/selectedInputFileId/.test(workflowPage)) {
  console.error('workflow input node should expose a real file selector and pass the selected backend fileId to runtime')
  failed = true
}

const settingsPage = fs.readFileSync('frontend/src/pages/settings/SettingsPage.vue', 'utf8')
if (/settings\.aiCredits/.test(settingsPage) || /\?\?\s*200/.test(settingsPage)) {
  console.error('settings page still renders the legacy AI credits badge/card')
  failed = true
}

if (/billingCards/.test(settingsPage) || /settings\.(monthlyBudget|currentSpend|renewalAt|plan)/.test(settingsPage)) {
  console.error('settings usage tab still renders the legacy SaaS billing cards')
  failed = true
}

if (!/usageOverviewCards/.test(settingsPage) || !/quotaGuardrails/.test(settingsPage) || !/costGuardrails/.test(settingsPage)) {
  console.error('settings usage tab does not expose AetherFlow usage and quota panels')
  failed = true
}

if (!/@click="openDefaultModelSettings"/.test(settingsPage) || !/showDefaultModelSettings/.test(settingsPage)) {
  console.error('default model settings button does not open a settings panel')
  failed = true
}

const buttonCopyChecks = [
  ['zh settings save button', 'frontend/src/i18n/locales/zh-CN.ts', /saveMockDraft:\s*['"][^'"]*mock/i],
  ['en settings save button', 'frontend/src/i18n/locales/en-US.ts', /saveMockDraft:\s*['"][^'"]*mock/i],
  ['zh project create button', 'frontend/src/i18n/locales/zh-CN.ts', /createMock:\s*['"][^'"]*mock/i],
  ['en project create button', 'frontend/src/i18n/locales/en-US.ts', /createMock:\s*['"][^'"]*mock/i],
  ['zh knowledge create button', 'frontend/src/i18n/locales/zh-CN.ts', /createMockDocument:\s*['"][^'"]*mock/i],
  ['en knowledge create button', 'frontend/src/i18n/locales/en-US.ts', /createMockDocument:\s*['"][^'"]*mock/i],
  ['zh invite button', 'frontend/src/i18n/locales/zh-CN.ts', /inviteMockUser:\s*['"][^'"]*mock/i],
  ['en invite button', 'frontend/src/i18n/locales/en-US.ts', /inviteMockUser:\s*['"][^'"]*mock/i],
]

for (const [name, file, pattern] of buttonCopyChecks) {
  const content = fs.readFileSync(file, 'utf8')
  if (pattern.test(content)) {
    console.error(`${name} still contains visible mock copy`)
    failed = true
  }
}

const aiModule = fs.readFileSync('frontend/src/api/modules/ai.ts', 'utf8')
if (!/getProviderConfigCatalog/.test(aiModule) || !/updateProviderConfig/.test(aiModule)) {
  console.error('frontend ai module does not expose provider runtime configuration APIs')
  failed = true
}

const monitorPage = fs.readFileSync('frontend/src/pages/monitor/MonitorPage.vue', 'utf8')
if (/grid-cols-\[96px/.test(monitorPage) || /{{\s*log\.time\s*}}/.test(monitorPage) || !/formatMonitorTime/.test(monitorPage)) {
  console.error('monitor conversation table still renders raw backend timestamps in a narrow column')
  failed = true
}

if (!/monitorEventRows/.test(monitorPage) || !/eventSeverityClass/.test(monitorPage) || !/monitor-event-stream/.test(monitorPage)) {
  console.error('monitor conversation logs should render as an enterprise event stream, not a plain table')
  failed = true
}

if (/border-l-4/.test(monitorPage) || /border-l-status-/.test(monitorPage)) {
  console.error('monitor event stream should not render heavy left status color bars')
  failed = true
}

const accountDropdown = fs.readFileSync('frontend/src/components/layout/AccountDropdown.vue', 'utf8')
if (!/fixed right-5 top-\[56px\] z-\[120\]/.test(accountDropdown) || /absolute right-0 top-11 z-50/.test(accountDropdown)) {
  console.error('account dropdown should render above workflow panels with a fixed high z-index layer')
  failed = true
}

if (!/<Teleport to="body">/.test(accountDropdown) || !/const menu = ref<HTMLElement \| null>\(null\)/.test(accountDropdown) || !/menu\.value\??\.contains\(target\)/.test(accountDropdown)) {
  console.error('account dropdown should teleport to body and keep outside-click handling for the teleported panel')
  failed = true
}

const topStatusBar = fs.readFileSync('frontend/src/components/layout/TopStatusBar.vue', 'utf8')
if (/workspace\.mode/.test(topStatusBar)) {
  console.error('top status bar should not show the legacy dev/mock workspace badge')
  failed = true
}

const landingPage = fs.readFileSync('frontend/src/pages/landing/LandingPage.vue', 'utf8')
if (/lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(420px,0\.95fr\)\]/.test(landingPage) || /<aside id="workflow"/.test(landingPage)) {
  console.error('landing hero should keep workflow feature panels below the first-screen hero')
  failed = true
}

const mainCss = fs.readFileSync('frontend/src/styles/main.css', 'utf8')
if (!/landing-blueprint/.test(landingPage) || !/\.landing-blueprint/.test(mainCss) || /pointer-events-none fixed left-0 top-0 z-30/.test(landingPage) || /rounded-full bg-primary shadow-\[0_0_0_8px/.test(landingPage)) {
  console.error('landing hero should use blueprint background without fixed decorative blue dots')
  failed = true
}

if (/localStorage\.setItem\([^)]*apiKey/i.test(settingsPage) || /localStorage\.setItem\([^)]*provider/i.test(settingsPage)) {
  console.error('settings page must not persist provider API keys in browser storage')
  failed = true
}

if (!/openProviderConfig/.test(settingsPage) || !/providerConfigForm/.test(settingsPage)) {
  console.error('settings page does not expose provider preset configuration UI')
  failed = true
}

if (!/developerAccessCards/.test(settingsPage) || !/developerEndpointCards/.test(settingsPage)) {
  console.error('settings API tab should render AetherFlow developer access cards')
  failed = true
}

const modelsPage = fs.readFileSync('frontend/src/pages/models/ModelsPage.vue', 'utf8')
if (/min-h-\[720px\]/.test(modelsPage) || /grid-rows-\[minmax\(0,1fr\)_220px\]/.test(modelsPage)) {
  console.error('models catalog should not reserve a fixed large height below model cards')
  failed = true
}

if (!/overflow-x-hidden overflow-y-auto bg-app-bg/.test(modelsPage) || !/grid min-h-\[calc\(100vh-190px\)\] gap-4 xl:grid-cols-\[360px_minmax\(0,1fr\)\]/.test(modelsPage) || /flex min-h-0 flex-col gap-4 overflow-y-auto/.test(modelsPage) || /grid items-start gap-4/.test(modelsPage) || /max-h-\[calc\(100vh-190px\)\]/.test(modelsPage)) {
  console.error('models page should scroll normally while provider rail stretches with the right column')
  failed = true
}

if (/models\.runtimeLogs[\s\S]{0,240}bg-sidebar/.test(modelsPage) || /text-text-inverse[\s\S]{0,240}models\.runtimeLogs/.test(modelsPage)) {
  console.error('models runtime logs should use the light console style, not a dark sidebar panel')
  failed = true
}

if (!/dataAccessCards/.test(settingsPage) || !/dataPipelineCards/.test(settingsPage)) {
  console.error('settings data tab should render AetherFlow data access and pipeline cards')
  failed = true
}

if (/settings\.(installDataSources|connectedDataSources|configuredApiExtensions)/.test(settingsPage)) {
  console.error('settings access tabs still render Dify-style plugin marketplace counters')
  failed = true
}

if (/settings\.upgradeNow/.test(settingsPage) || /upgradeNow:\s*['"]/.test(fs.readFileSync('frontend/src/i18n/locales/zh-CN.ts', 'utf8'))) {
  console.error('members page still exposes the upgrade button copy')
  failed = true
}

const workflowApi = fs.readFileSync('frontend/src/services/api/workflowApi.ts', 'utf8')
if (!/mapBackendDefinitionGraph/.test(workflowApi) || !/NODE_KIND_BY_BACKEND_TYPE/.test(workflowApi) || !/START:\s*'start'/.test(workflowApi) || !/backendTargets/.test(workflowApi)) {
  console.error('workflow API should render persisted backend definition DTOs as frontend graph nodes and edges')
  failed = true
}

if (!/function cloneWorkflow/.test(workflowApi) || /structuredClone\(workflow\)/.test(workflowApi)) {
  console.error('workflow save cache should not structuredClone Vue reactive workflow objects')
  failed = true
}

if (!/openMemberDialog/.test(settingsPage) || !/memberForm/.test(settingsPage) || !/deleteWorkspaceMember/.test(fs.readFileSync('frontend/src/stores/settingsStore.ts', 'utf8'))) {
  console.error('members page does not expose real member management actions')
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log('frontend real-data smoke checks passed')
