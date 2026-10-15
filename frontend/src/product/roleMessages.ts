const messages = {
  'zh-CN': {
    home: '我的工作台', admin: '管理概览', personal: '个人工作', management: '平台管理',
    serviceCatalog: '可用服务', serviceManagement: '服务管理', platformStatus: '平台状态',
    restricted: '此入口需要管理员权限，已返回你的工作台。你仍可以编辑自己的工作流、查看运行与结果。',
    adminScope: '平台管理不会授予访问其他用户私有项目、运行或文件的权限。',
    myRuns: '我的运行', preferences: '个人偏好', roleUser: '普通用户', roleAdmin: '管理员',
    adminRequired: '此页面需要管理员权限', backHome: '返回我的工作台',
  },
  'en-US': {
    home: 'My workbench', admin: 'Admin overview', personal: 'Personal work', management: 'Platform administration',
    serviceCatalog: 'Available services', serviceManagement: 'Service management', platformStatus: 'Platform status',
    restricted: 'This area requires administrator access. You are back in your workbench, where you can edit your workflows and review your runs and results.',
    adminScope: 'Platform administration does not grant access to other users’ private projects, runs or files.',
    myRuns: 'My runs', preferences: 'Personal preferences', roleUser: 'User', roleAdmin: 'Administrator',
    adminRequired: 'Administrator access is required', backHome: 'Back to my workbench',
  },
  'ja-JP': {
    home: 'マイワークベンチ', admin: '管理の概要', personal: '個人の作業', management: 'プラットフォーム管理',
    serviceCatalog: '利用可能なサービス', serviceManagement: 'サービス管理', platformStatus: 'プラットフォームの状態',
    restricted: 'この画面には管理者権限が必要です。ワークベンチに戻りました。自分のワークフロー、実行履歴、結果は引き続き利用できます。',
    adminScope: '管理者であることは、他のユーザーの非公開プロジェクト、実行、ファイルへのアクセスを許可しません。',
    myRuns: '自分の実行履歴', preferences: '個人設定', roleUser: '一般ユーザー', roleAdmin: '管理者',
    adminRequired: '管理者権限が必要です', backHome: 'マイワークベンチへ戻る',
  },
}
export function roleMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages['en-US']
}
