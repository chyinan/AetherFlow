// pattern: Functional Core
import type { WhisperEnvironment } from '@/api/modules/nodeConnections'

export type WhisperDeployment = 'host' | 'compose'
export type WhisperSetupDraft = Pick<WhisperEnvironment, 'model' | 'device' | 'computeType'>
type EnvironmentValues = WhisperSetupDraft & Pick<WhisperEnvironment, 'enabled'> & { status: string }
export type WhisperSetupBlocker = 'unreachable' | 'disabled' | 'dependency' | 'ffmpeg' | 'missingModel' | 'unloaded' | 'restart'
export type WhisperSetupField = 'model' | 'device' | 'computeType' | 'loadedModel'

// 建议是可编辑的部署草稿，不能冒充当前进程配置或硬件探测结果。
export function createWhisperSetupDraft(): WhisperSetupDraft {
  return { model: 'small', device: 'cpu', computeType: 'int8' }
}

export function isValidWhisperSetupDraft(draft: WhisperSetupDraft): boolean {
  return [draft.model, draft.device, draft.computeType].every(
    (value) => typeof value === 'string' && !!value.trim() && !/[\r\n\0]/.test(value),
  )
}

// 只输出完整的真实配置；单引号用于 .env 值，避免插值和注释改变原值。
export function buildWhisperEnvironmentSnippet(environment: EnvironmentValues | null): string | null {
  if (!environment || !['unconfigured', 'unloaded', 'missing_model', 'usable'].includes(environment.status)
    || typeof environment.enabled !== 'boolean' || !isValidWhisperSetupDraft(environment)) return null
  const quote = (value: string) => /^[a-zA-Z0-9_./:+-]+$/.test(value)
    ? value
    : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  return [
    `ENABLE_WHISPER=${environment.enabled ? 'true' : 'false'}`,
    `WHISPER_MODEL=${quote(environment.model)}`,
    `WHISPER_DEVICE=${quote(environment.device)}`,
    `WHISPER_COMPUTE_TYPE=${quote(environment.computeType)}`,
  ].join('\n')
}

export function buildWhisperSuggestedSnippet(draft: WhisperSetupDraft, deployment: WhisperDeployment | ''): string | null {
  if (!deployment || !isValidWhisperSetupDraft(draft)) return null
  if (deployment === 'compose') return buildWhisperEnvironmentSnippet({ ...draft, enabled: true, status: 'unconfigured' })
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  return [
    "$env:ENABLE_WHISPER='true'",
    `$env:WHISPER_MODEL=${quote(draft.model)}`,
    `$env:WHISPER_DEVICE=${quote(draft.device)}`,
    `$env:WHISPER_COMPUTE_TYPE=${quote(draft.computeType)}`,
  ].join('\n')
}

export function getWhisperSetupBlockers(environment: WhisperEnvironment | null): WhisperSetupBlocker[] {
  if (!environment || environment.status === 'unreachable') return ['unreachable']
  const blockers: WhisperSetupBlocker[] = []
  if (!environment.enabled) blockers.push('disabled')
  if (!environment.dependencyAvailable) blockers.push('dependency')
  if (!environment.ffmpegAvailable) blockers.push('ffmpeg')
  if (environment.status === 'missing_model') blockers.push('missingModel')
  if (!environment.loadedModel || !['usable', 'unconfigured', 'missing_model'].includes(environment.status)) blockers.push('unloaded')
  if (environment.restartRequired) blockers.push('restart')
  return blockers
}

export function verifyWhisperSetup(environment: WhisperEnvironment, draft: WhisperSetupDraft) {
  const blockers = getWhisperSetupBlockers(environment)
  const mismatches: WhisperSetupField[] = environment.status === 'unreachable' ? [] :
    (['model', 'device', 'computeType', 'loadedModel'] as const).filter(
      (field) => environment[field] !== draft[field === 'loadedModel' ? 'model' : field],
    )
  return {
    success: isValidWhisperSetupDraft(draft) && environment.status === 'usable' && blockers.length === 0 && mismatches.length === 0,
    blockers,
    mismatches,
  }
}
