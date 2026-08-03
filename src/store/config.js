import { env, blocks, wallet, transfers, relayers } from '@starport/vuex'
import generated from './generated'
export default function init(store) {
  for (const moduleInit of Object.values(generated)) {
    moduleInit(store)
  }
  transfers(store)
  blocks(store)
  // `common/env` constructs Starport's SPClient, whose built-in connectivity
  // timer polls the REST and RPC roots. MatterOverwatch uses its own
  // network-aware HTTP endpoints; keep this legacy client opt-in only.
  if (String(import.meta.env.VITE_APP_DCL_BOOTSTRAP ?? 'false').toLowerCase() === 'true') {
    env(store)
  }
  wallet(store)
  relayers(store)
}
