/**
 * @ccip-examples/shared-config
 *
 * Shared network and token configuration for CCIP SDK examples.
 *
 * Design principles:
 * - Store only what can't be fetched from SDK (addresses, RPC URLs)
 * - Fetch metadata (chainId, chainSelector, decimals) from SDK
 * - Keys are SDK-compatible networkIds
 */

// Network exports
export {
  type NativeCurrency,
  type NetworkConfig,
  NETWORKS,
  NETWORK_IDS,
  getNetwork,
  getEVMNetworks,
  getSolanaNetworks,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  getAllNetworks,
} from "./networks.js";

// Token exports
export {
  type TokenAddresses,
  TOKEN_ADDRESSES,
  TOKEN_KEYS,
  CCIP_BNM_ADDRESSES,
  getTokenAddress,
} from "./tokens.js";

// Constants exports
export {
  EXTERNAL_URLS,
  MESSAGE_STAGES,
  POLLING_CONFIG,
  STATUS_DESCRIPTIONS,
  DUMMY_ADDRESSES,
  getFaucetUrl,
  getStageFromStatus,
  getStatusDescription,
} from "./constants.js";
