import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          soft: '#DBEAFE',
          dark: '#1D4ED8',
        },
        app: {
          bg: '#F6F7F9',
          bg2: '#F8FAFC',
          surface: '#FFFFFF',
          muted: '#F1F4F8',
          border: '#E4E7EC',
          strong: '#CBD5E1',
        },
        sidebar: {
          DEFAULT: '#151A22',
          soft: '#1C2430',
        },
        text: {
          primary: '#111827',
          secondary: '#667085',
          muted: '#98A2B3',
          inverse: '#F8FAFC',
        },
        status: {
          success: '#16A34A',
          running: '#0284C7',
          warning: '#D97706',
          error: '#DC2626',
          paused: '#64748B',
        },
        ai: {
          DEFAULT: '#7C3AED',
          soft: '#EDE9FE',
        },
      },
      boxShadow: {
        panel: '0 8px 24px rgba(15, 23, 42, 0.08)',
        node: '0 8px 18px rgba(37, 99, 235, 0.10)',
      },
      fontFamily: {
        sans: ['Aptos', 'Segoe UI Variable', 'Segoe UI', 'sans-serif'],
        display: ['Aptos Display', 'Aptos', 'Segoe UI Variable', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
