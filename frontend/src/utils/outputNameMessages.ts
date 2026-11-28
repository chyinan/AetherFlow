export const outputNameMessages = {
  'zh-CN': { duplicate: '该输出名称已存在。原输出已保留，请改用唯一名称后再保存或运行。' },
  'en-US': { duplicate: 'This output name already exists. The original outputs are preserved. Choose a unique name before saving or running.' },
  'ja-JP': { duplicate: 'この出力名は既に存在します。元の出力は保持されています。保存・実行の前に別の名前を入力してください。' },
}

export function outputNameConflictMessage(locale: string) {
  return (outputNameMessages[locale as keyof typeof outputNameMessages] ?? outputNameMessages['en-US']).duplicate
}
