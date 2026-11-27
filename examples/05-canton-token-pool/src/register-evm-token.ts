/**
 * CCIP SDK Example: register an EVM token in the TokenAdminRegistry and point
 * it at its pool — propose admin (via the registry module) → accept admin →
 * setPool. Required before CCIP can route transfers for the token; without it
 * execution fails with NotACompatiblePool.
 *
 * Usage:
 *   pnpm register-evm-token
 *
 * Env: EVM_RPC_URL, EVM_PRIVATE_KEY (token admin/owner key),
 *      EVM_TOKEN_ADDRESS, EVM_POOL_ADDRESS.
 * Optional: EVM_TAR_ADDRESS (default: Sepolia CCIP TAR), EVM_REGISTRY_MODULE
 * (default: discovered from the TAR's RegistryModuleAdded events).
 */
import "dotenv/config";

import { EVMTokenManager } from "@chainlink/ccip-sdk/cct/evm";
import { JsonRpcProvider, Wallet, id as keccak256Utf8 } from "ethers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const rpcUrl = requireEnv("EVM_RPC_URL");
const tokenAddress = requireEnv("EVM_TOKEN_ADDRESS");
const poolAddress = requireEnv("EVM_POOL_ADDRESS");
// Sepolia CCIP TokenAdminRegistry + RegistryModuleOwnerCustom (CCIP directory,
// verified on-chain via TAR.isRegistryModule).
const tarAddress = process.env.EVM_TAR_ADDRESS ?? "0x95f29fee11c5c55d26cccf1db6772de953b37b82";
const DEFAULT_REGISTRY_MODULE = "0xa3c796d480638d7476792230da1E2ADa86e031b0";

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(requireEnv("EVM_PRIVATE_KEY"), provider);

// The RegistryModuleOwnerCustom can't be discovered by view calls — but the
// TAR emits RegistryModuleAdded for each. Latest registration wins.
async function discoverRegistryModule(): Promise<string> {
  if (process.env.EVM_REGISTRY_MODULE) return process.env.EVM_REGISTRY_MODULE;
  if (Number((await provider.getNetwork()).chainId) === 11155111) {
    return DEFAULT_REGISTRY_MODULE; // Sepolia fast path (history-scanning hits pruned-RPC limits)
  }
  // RPCs cap eth_getLogs ranges (~50k blocks); scan backwards in chunks —
  // latest registration wins, so the first hit walking back is the answer.
  const topic = keccak256Utf8("RegistryModuleAdded(address)");
  const CHUNK = 45_000;
  let to = await provider.getBlockNumber();
  for (let i = 0; i < 200 && to > 0; i++) {
    const from = Math.max(0, to - CHUNK);
    const logs = await provider.getLogs({
      address: tarAddress,
      topics: [topic],
      fromBlock: from,
      toBlock: to,
    });
    const latest = logs.at(-1);
    if (latest) {
      // `module` is non-indexed: last 20 bytes of the event data (topics[1] when indexed).
      const module =
        "0x" + (latest.topics[1] ? latest.topics[1].slice(26) : latest.data.slice(-40));
      console.error(`discovered registry module: ${module} (block ${latest.blockNumber})`);
      return module;
    }
    to = from - 1;
  }
  throw new Error(`no RegistryModuleAdded events on TAR ${tarAddress} — set EVM_REGISTRY_MODULE`);
}

const registryModule = await discoverRegistryModule();
const cct = await EVMTokenManager.fromUrl(rpcUrl);

console.error(`registering ${tokenAddress} → pool ${poolAddress} (TAR ${tarAddress})`);

// 1. Propose the wallet as the token's registry admin (via the module, proving
//    ownership of the token contract).
const reg = await cct.registerAdmin({ tokenAddress, registryModule, address: tarAddress, wallet });
console.error("✓ admin proposed:", reg.hash);

// 2. Accept the admin role (must come from the proposed admin — the wallet).
const acc = await cct.acceptAdmin({ tokenAddress, address: tarAddress, wallet });
console.error("✓ admin accepted:", acc.hash);

// 3. Point the token at its pool.
const set = await cct.setPool({ tokenAddress, poolAddress, address: tarAddress, wallet });
console.error("✓ pool set:", set.hash);

// Read back
const state = await cct.getTokenAdminRegistry({ tokenAddress, address: tarAddress });
console.error(`readback: admin=${state.administrator} pool=${state.tokenPool}`);
