import { enUS } from './en-US'

export const jaJP = {
  ...enUS,
  app: {
    ...enUS.app,
    name: 'AetherFlow',
    console: 'AI Workflow Console',
  },
  landing: {
    ...enUS.landing,
    title: '公開ホーム',
    badge: '企業向け AI ワークフロープラットフォーム',
    heroTitle: 'AI フローを',
    heroAccent: '動かす',
    subtitle: 'AetherFlow はモデル、ファイル、実行ログをつなぎ、設計から納品までワークフローを見える化します。',
    primaryCta: '今すぐ開始',
    secondaryCta: 'フローを見る',
    stats: {
      workflowValue: '12+',
      workflowLabel: '組み込みノードタイプ',
      runtimeValue: 'Live',
      runtimeLabel: '実行ログと状態',
      mockValue: 'Local',
      mockLabel: '制御可能なデモ環境',
    },
    panel: {
      kicker: 'Workspace Flow',
      title: '入力から成果物まで一画面で管理',
      status: '実行中',
      queue: '待機中',
      live: 'LIVE',
    },
    cards: {
      orchestrate: {
        title: 'Agent ステップを編成',
        body: 'ノードをドラッグして、モデル、ツール、分岐を整理します。',
      },
      files: {
        title: 'ファイルと成果物を管理',
        body: '素材をアップロードし、進捗と出力結果を追跡します。',
      },
      observe: {
        title: 'すべての実行を観測',
        body: 'ログ、ノード状態、エラー文脈を検索可能に保ちます。',
      },
    },
    tiles: {
      deploy: {
        title: '軽量なデプロイ画面',
        body: 'デモ、連携確認、授業レビュー向けのコンソール先頭画面です。',
      },
      trace: {
        title: '追跡可能なワークフロー',
        body: 'プロジェクト、ワークフロー、実行記録を明確な状態でまとめます。',
      },
    },
  },
  auth: {
    ...enUS.auth,
    signIn: 'ログイン',
    signInTitle: 'AetherFlow にログイン',
    signInHint: '👋 ようこそ。ログインして利用を開始してください。',
    username: 'メール',
    emailPlaceholder: 'メールアドレスを入力',
    password: 'パスワード',
    passwordPlaceholder: 'パスワードを入力',
    forgotPassword: 'パスワードを忘れた場合',
    loginUnavailable: 'ログインサービスを利用できません。バックエンド状態を確認するか、デモアカウントを使用してください。',
    divider: 'または',
    continueWithGithub: 'GitHub でログイン',
    continueWithGoogle: 'Google でログイン',
    sendVerificationCode: '確認コードを送信',
    termsPrefix: '利用すると、以下に同意したものとみなされます',
    termsOfUse: '利用規約',
    privacyPolicy: 'プライバシーポリシー',
    newToAetherFlow: 'AetherFlow を初めて利用しますか？',
    createAccount: 'アカウントを作成',
    backHome: 'ホームへ戻る',
    mockHint: 'デモアカウント: aether.operator / mock-password。バックエンド利用時は JWT ログインを優先します。',
    footer: {
      terms: '利用規約',
      privacy: 'プライバシー',
      docs: 'ドキュメント',
      support: 'サポート',
    },
  },
} satisfies typeof enUS
