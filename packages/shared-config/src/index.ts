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

// Re-export ChainFamily from SDK so consumers don't need a direct SDK import
// just for the type that getAllNetworks() returns.
export { ChainFamily } from "@chainlink/ccip-sdk";

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
  type FeeTokenOption,
  type FeeTokenMetadata,
  type TokenAddresses,
  TOKEN_ADDRESSES,
  TOKEN_KEYS,
  CCIP_BNM_ADDRESSES,
  LINK_TOKEN_ADDRESSES,
  getTokenAddress,
  resolveFeeTokenAddress,
  getAvailableFeeTokens,
  isFeeTokenAvailable,
} from "./tokens.js";

// Constants exports
export {
  CHAIN_FAMILY_LABELS,
  EXTERNAL_URLS,
  MESSAGE_STAGES,
  POLLING_CONFIG,
  STATUS_DESCRIPTIONS,
  DUMMY_ADDRESSES,
  getFaucetUrl,
  getDummyReceiver,
  getStageFromStatus,
  getStatusDescription,
} from "./constants.js";
