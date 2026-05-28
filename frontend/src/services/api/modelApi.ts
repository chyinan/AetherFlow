import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

import { mockModelCatalog, mockModelProviders, mockModelRuntimeLogs, mockRoutingPolicies } from '../mock/modelMock'
import { delay } from '../mock/timing'

export const modelApi = {
  listProviders() {
    return delay<ModelProvider[]>(mockModelProviders)
  },
  listModels() {
    return delay<ModelCatalogItem[]>(mockModelCatalog)
  },
  listRoutingPolicies() {
    return delay<ModelRoutingPolicy[]>(mockRoutingPolicies)
  },
  listRuntimeLogs() {
    return delay<ModelRuntimeLog[]>(mockModelRuntimeLogs)
  },
}
