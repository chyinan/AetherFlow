import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const frontendEnvExample = readFileSync(resolve(root, 'frontend', '.env.example'), 'utf8')
const initScript = readFileSync(resolve(root, 'scripts', 'aetherflow-init-env.ps1'), 'utf8')
const workflowProd = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'resources', 'application-prod.yml'), 'utf8')
const rabbitDefinitions = readFileSync(resolve(root, 'docker', 'rabbitmq', 'definitions.json'), 'utf8')
const demoController = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'demo', 'WorkflowSeataDemoController.java'), 'utf8')
const mockNodeExecutor = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'node', 'executor', 'MockNodeExecutor.java'), 'utf8')
const workflowNodeCatalog = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'node', 'catalog', 'WorkflowNodeCatalogService.java'), 'utf8')
const documentFormatPolicy = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'document', 'DocumentFormatPolicy.java'), 'utf8')
const documentExtractionService = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'document', 'DocumentContentExtractionService.java'), 'utf8')
const internalTaskController = readFileSync(resolve(root, 'backend', 'task-service', 'src', 'main', 'java', 'com', 'aetherflow', 'task', 'controller', 'InternalTaskController.java'), 'utf8')
const internalFileController = readFileSync(resolve(root, 'backend', 'file-service', 'src', 'main', 'java', 'com', 'aetherflow', 'file', 'controller', 'InternalFileController.java'), 'utf8')
const aiFileProperties = readFileSync(resolve(root, 'backend', 'ai-service', 'src', 'main', 'java', 'com', 'aetherflow', 'ai', 'config', 'FileClientProperties.java'), 'utf8')
const workflowNodeProperties = readFileSync(resolve(root, 'backend', 'workflow-service', 'src', 'main', 'java', 'com', 'aetherflow', 'workflow', 'node', 'WorkflowNodeProperties.java'), 'utf8')
const codeRuntimeDockerfile = readFileSync(resolve(root, 'python-ai-service', 'CodeRuntime.Dockerfile'), 'utf8')
const productionProfiles = [
  'workflow-service',
  'auth-service',
  'task-service',
  'gateway-service',
  'notify-service',
  'ai-service',
  'file-service',
].map((service) => readFileSync(resolve(root, 'backend', service, 'src', 'main', 'resources', 'application-prod.yml'), 'utf8'))

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message)
  }
}

function assertExcludes(source, unexpected, message) {
  if (source.includes(unexpected)) {
    throw new Error(message)
  }
}

assertExcludes(compose, 'VITE_MOCK_FALLBACK: ${VITE_MOCK_FALLBACK:-true}', 'production compose must not enable frontend mock fallback by default')
assertIncludes(compose, 'VITE_MOCK_FALLBACK: ${VITE_MOCK_FALLBACK:-false}', 'production compose must explicitly disable frontend mock fallback')
assertIncludes(compose, 'WORKFLOW_OCR_MOCK: ${WORKFLOW_OCR_MOCK:-false}', 'production compose must use real OCR by default')
assertIncludes(workflowProd, 'mock: ${WORKFLOW_OCR_MOCK:false}', 'workflow production profile must use real OCR by default')
assertIncludes(workflowProd, 'default-provider: ${WORKFLOW_OCR_PROVIDER:auto}', 'workflow production profile must select the unified real document provider')
assertIncludes(envExample, 'WORKFLOW_OCR_MOCK=false', 'environment template must disable OCR mock')
assertIncludes(envExample, 'WORKFLOW_OCR_PROVIDER=auto', 'environment template must select the unified real document provider')
assertIncludes(compose, 'WORKFLOW_DOCUMENT_MAX_FILE_BYTES: ${WORKFLOW_DOCUMENT_MAX_FILE_BYTES:-26214400}', 'production compose must bound document input size')
assertIncludes(compose, 'WORKFLOW_DOCUMENT_MAX_EXTRACTED_CHARACTERS: ${WORKFLOW_DOCUMENT_MAX_EXTRACTED_CHARACTERS:-1000000}', 'production compose must bound extracted document text')
assertIncludes(documentFormatPolicy, 'DOCUMENT_EXTENSIONS', 'backend must own a machine-readable document format allow-list')
assertIncludes(documentExtractionService, 'TesseractOCRProvider', 'unified document extraction must retain an OCR fallback for images and scanned PDFs')
assertIncludes(frontendEnvExample, 'VITE_MOCK_FALLBACK=false', 'frontend environment template must disable mock fallback')
assertIncludes(frontendEnvExample, 'WORKFLOW_OCR_MOCK=false', 'frontend environment template must not advertise OCR mock')
assertExcludes(compose, 'JWT_SECRET: ${JWT_SECRET:-aetherflow-dev-secret-key-change-me-32bytes-minimum}', 'production compose must not fall back to a public JWT secret')
assertIncludes(compose, 'JWT_SECRET: ${JWT_SECRET:?', 'production compose must fail fast when JWT_SECRET is missing')
for (const secretName of [
  'MYSQL_ROOT_PASSWORD',
  'MYSQL_PASSWORD',
  'REDIS_PASSWORD',
  'RABBITMQ_PASSWORD',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'ELASTIC_PASSWORD',
  'NACOS_AUTH_TOKEN',
  'NACOS_AUTH_IDENTITY_VALUE',
  'FILE_INTERNAL_TOKEN',
  'TASK_INTERNAL_TOKEN',
]) {
  assertIncludes(compose, `${secretName}: \${${secretName}:?`, `production compose must fail fast when ${secretName} is missing`)
}
assertIncludes(initScript, 'RandomNumberGenerator', 'environment initializer must use a cryptographic random number generator')
assertIncludes(initScript, "Set-SecureEnvValue $content 'JWT_SECRET'", 'environment initializer must initialize JWT_SECRET without rotating a strong value')
assertIncludes(initScript, "Set-EnvValue $content 'WORKFLOW_OCR_PROVIDER' 'auto'", 'environment initializer must select the unified real document provider')
assertIncludes(initScript, "Set-SecureEnvValue $content 'MINIO_ACCESS_KEY'", 'environment initializer must generate the MinIO access key')
assertIncludes(initScript, "Set-SecureEnvValue $content 'FILE_INTERNAL_TOKEN'", 'environment initializer must generate the file-service internal token')
assertIncludes(initScript, "Set-SecureEnvValue $content 'TASK_INTERNAL_TOKEN'", 'environment initializer must generate the task-service internal token')
assertExcludes(rabbitDefinitions, '"password": "aetherflow"', 'RabbitMQ definitions must not override the generated password')
assertIncludes(demoController, '@Profile("dev")', 'workflow demo endpoints must only exist in the dev profile')
assertIncludes(mockNodeExecutor, '@Profile("!prod")', 'mock workflow executor must not load in production')
assertExcludes(workflowNodeCatalog, '"MOCK",\n                "Mock"', 'public workflow node catalog must not expose the mock node')
assertIncludes(compose, 'ENABLE_WHISPER: ${ENABLE_WHISPER:-false}', 'production compose must keep Whisper opt-in')
assertIncludes(compose, 'ENABLE_LLM: ${ENABLE_LLM:-false}', 'production compose must keep local LLM loading opt-in')
assertIncludes(compose, 'WORKFLOW_AI_ASYNC_ENABLED: ${WORKFLOW_AI_ASYNC_ENABLED:-true}', 'production workflows must use asynchronous AI tasks by default')
assertIncludes(compose, 'WORKFLOW_CODE_EXECUTION_ENABLED: ${WORKFLOW_CODE_EXECUTION_ENABLED:-false}', 'production compose must keep code execution disabled until a resource-isolated runtime is configured')
assertIncludes(envExample, 'WORKFLOW_CODE_EXECUTION_ENABLED=false', 'environment template must keep code execution disabled by default')
assertIncludes(compose, 'code-runtime-service:', 'production compose must provide a dedicated code runtime service')
assertIncludes(compose, 'CODE_RUNTIME_API_KEY: ${CODE_RUNTIME_API_KEY:?', 'code runtime must fail fast without a strong service credential')
assertIncludes(compose, 'dockerfile: python-ai-service/CodeRuntime.Dockerfile', 'code runtime must use the minimal runtime image')
assertIncludes(codeRuntimeDockerfile, 'USER app', 'code runtime image must run as a non-root user')
assertIncludes(compose, 'read_only: true', 'code runtime container must use a read-only root filesystem')
assertIncludes(compose, 'aetherflow-code-runtime:', 'workflow and code runtime must use a private network')
assertIncludes(compose, 'WORKFLOW_CODE_RUNTIME_URL: ${WORKFLOW_CODE_RUNTIME_URL:-http://code-runtime-service:8300}', 'workflow must target the dedicated code runtime by default')
assertIncludes(initScript, "Set-SecureEnvValue $content 'CODE_RUNTIME_API_KEY'", 'environment initializer must generate a dedicated code runtime credential')
assertIncludes(compose, 'MANAGEMENT_OTLP_TRACING_ENDPOINT: http://jaeger:4318/v1/traces', 'Java services must export traces through OTLP')
assertIncludes(compose, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://jaeger:4318/v1/traces', 'Python service must export traces through OTLP')
assertIncludes(compose, 'SPRING_RABBITMQ_TEMPLATE_OBSERVATION_ENABLED: "true"', 'RabbitMQ producers must emit observations')
assertIncludes(envExample, 'ENABLE_WHISPER=false', 'environment template must keep Whisper disabled until explicitly enabled')
assertIncludes(envExample, 'ENABLE_LLM=false', 'environment template must keep local LLM loading disabled until explicitly enabled')
assertIncludes(envExample, 'WORKFLOW_AI_ASYNC_ENABLED=true', 'environment template must keep asynchronous AI workflow execution enabled')
for (const controller of [internalTaskController, internalFileController]) {
  assertIncludes(controller, 'InternalServiceTokenService', 'internal controllers must validate signed short-lived credentials')
  assertExcludes(controller, 'MessageDigest.isEqual', 'internal controllers must not compare reusable shared tokens')
}
assertIncludes(aiFileProperties, 'issueInternalToken()', 'AI service must issue a credential for each internal file request')
assertIncludes(workflowNodeProperties, 'issueFileInternalToken()', 'workflow service must issue a credential for each internal file request')
for (const profile of productionProfiles) {
  if (/\$\{(?:MYSQL_PASSWORD|REDIS_PASSWORD|RABBITMQ_PASSWORD|MINIO_SECRET_KEY):(?:mysql|aetherflow|minioadmin)?\}/.test(profile)) {
    throw new Error('production Spring profiles must not contain weak or empty infrastructure password fallbacks')
  }
  if (/internal-token:\s*\$\{[^}:]+:aetherflow-/.test(profile)) {
    throw new Error('production Spring profiles must not contain public internal-token fallbacks')
  }
}

console.log('production compose defaults fail closed and environment secrets are initialized securely')
