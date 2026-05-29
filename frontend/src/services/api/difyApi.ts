import type {
  ConversationLog,
  KnowledgeDataset,
  KnowledgeSegment,
  MonitorMetric,
} from '@/types/dify'

import {
  mockConversationLogs,
  mockKnowledgeDatasets,
  mockKnowledgeSegments,
  mockMonitorMetrics,
} from '../mock/difyMock'
import { delay } from '../mock/timing'

export const difyApi = {
  listKnowledgeDatasets() {
    return delay<KnowledgeDataset[]>(mockKnowledgeDatasets)
  },
  listKnowledgeSegments() {
    return delay<KnowledgeSegment[]>(mockKnowledgeSegments)
  },
  listMonitorMetrics() {
    return delay<MonitorMetric[]>(mockMonitorMetrics)
  },
  listConversationLogs() {
    return delay<ConversationLog[]>(mockConversationLogs)
  },
}
