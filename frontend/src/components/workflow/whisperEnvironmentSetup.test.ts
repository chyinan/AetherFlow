import { describe, expect, it } from 'vitest'
import type { WhisperEnvironment } from '@/api/modules/nodeConnections'
import {
  buildWhisperSuggestedSnippet, createWhisperSetupDraft, getWhisperSetupBlockers,
  isValidWhisperSetupDraft, verifyWhisperSetup,
} from './whisperEnvironmentSetup'

const draft = createWhisperSetupDraft()
const environment: WhisperEnvironment = {
  ...draft, status: 'usable', enabled: true, loadedModel: 'small', dependencyAvailable: true,
  ffmpegAvailable: true, detectedFrom: 'backend', restartRequired: false, message: 'loaded',
}

describe('Whisper 部署建议', () => {
  it('默认值明确为独立建议，不修改后端对象或共享草稿', () => {
    const first = createWhisperSetupDraft()
    first.model = 'changed'
    expect(createWhisperSetupDraft()).toEqual({ model: 'small', device: 'cpu', computeType: 'int8' })
    expect(buildWhisperSuggestedSnippet(draft, '')).toBeNull()
  })
  it('Compose 输出待手工启用的 .env 配置', () => {
    expect(buildWhisperSuggestedSnippet(draft, 'compose')).toBe('ENABLE_WHISPER=true\nWHISPER_MODEL=small\nWHISPER_DEVICE=cpu\nWHISPER_COMPUTE_TYPE=int8')
  })
  it('宿主进程提供 PowerShell 格式，并保留路径与特殊字符的字面值', () => {
    expect(buildWhisperSuggestedSnippet({ ...draft, model: "C:\\Models\\I'm $local; #model" }, 'host')).toBe(
      "$env:ENABLE_WHISPER='true'\n$env:WHISPER_MODEL='C:\\Models\\I''m $local; #model'\n$env:WHISPER_DEVICE='cpu'\n$env:WHISPER_COMPUTE_TYPE='int8'",
    )
  })
  it.each(['', '  ', 'model\nOTHER=true', 'model\rvalue', 'model\0value'])('拒绝空值或多行注入：%j', (model) => {
    expect(isValidWhisperSetupDraft({ ...draft, model })).toBe(false)
    expect(buildWhisperSuggestedSnippet({ ...draft, model }, 'host')).toBeNull()
    expect(buildWhisperSuggestedSnippet({ ...draft, model }, 'compose')).toBeNull()
  })
})

describe('Whisper 前置条件与验证', () => {
  it('没有快照或后端不可达时仅报告未知，不猜测缺依赖或模型', () => {
    expect(getWhisperSetupBlockers(null)).toEqual(['unreachable'])
    const offline = { ...environment, status: 'unreachable' as const, enabled: false, dependencyAvailable: false, ffmpegAvailable: false, loadedModel: null }
    expect(getWhisperSetupBlockers(offline)).toEqual(['unreachable'])
    expect(verifyWhisperSetup(offline, draft)).toEqual({ success: false, blockers: ['unreachable'], mismatches: [] })
  })
  it('同时满足实际启用、加载、依赖、FFmpeg、配置匹配且无需重启才通过', () => {
    expect(verifyWhisperSetup(environment, draft)).toEqual({ success: true, blockers: [], mismatches: [] })
  })
  it.each([
    [{ enabled: false }, 'disabled'],
    [{ dependencyAvailable: false }, 'dependency'],
    [{ ffmpegAvailable: false }, 'ffmpeg'],
    [{ loadedModel: null }, 'unloaded'],
    [{ status: 'unloaded' }, 'unloaded'],
    [{ status: 'missing_model' }, 'missingModel'],
    [{ restartRequired: true }, 'restart'],
  ] as const)('运行状态 %j 不能误报成功', (change, blocker) => {
    const result = verifyWhisperSetup({ ...environment, ...change }, draft)
    expect(result.success).toBe(false)
    expect(result.blockers).toContain(blocker)
  })
  it.each(['model', 'device', 'computeType', 'loadedModel'] as const)('即使旧运行时可用，%s 不匹配也不通过', (field) => {
    const result = verifyWhisperSetup({ ...environment, [field]: 'different' }, draft)
    expect(result.success).toBe(false)
    expect(result.mismatches).toEqual([field])
  })
  it('未明确返回可用时保守拒绝通过；无效建议同样不能通过', () => {
    expect(verifyWhisperSetup({ ...environment, status: 'unconfigured' }, draft).success).toBe(false)
    expect(verifyWhisperSetup(environment, { ...draft, model: '' }).success).toBe(false)
  })
})
