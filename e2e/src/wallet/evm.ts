/**
 * An EIP-1193 provider for the browser, backed by a real key against live testnets.
 *
 * The private key never enters the page. `window.ethereum.request` is a thin shim
 * that forwards to a Playwright binding, so all signing happens in Node with viem
 * and the browser only ever sees results. That keeps the key out of the page
 * context, out of any heap snapshot, and out of a trace artifact.
 *
 * Reads are proxied to the same public RPCs the apps use, so the fees, balances,
 * allowances and lane config under test are the live testnet ones, not a fork's.
 *
 * Sends are real. `CCIP_E2E_ALLOW_SEND=0` disables them, so a checkout without
 * an .env cannot spend by accident.
 */

import type { Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";

/** Chains the example apps offer. Keep in sync with shared-config's NETWORKS. */
export const SUPPORTED_CHAINS: Chain[] = [sepolia, baseSepolia];

export interface EvmWalletOptions {
  /** 0x-prefixed test key. Never commit one; read it from the environment. */
  privateKey: Hex;
  /** Chain the wallet reports on connect. */
  initialChainId?: number;
  /** Per-chain RPC overrides; falls back to each chain's public endpoint. */
  rpcUrls?: Record<number, string>;
  /** Permit eth_sendTransaction. */
  allowSend?: boolean;
}

interface RpcRequest {
  method: string;
  params?: unknown[];
}

const BINDING = "__ccipE2eWalletRequest";

/** Methods that must be answered locally rather than forwarded to an RPC node. */
const LOCAL_METHODS = new Set([
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "net_version",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_requestPermissions",
  "wallet_getPermissions",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
]);

export class EvmTestWallet {
  readonly address: Hex;
  private chainId: number;
  /** Set once the dapp calls eth_requestAccounts, like a real approval. */
  private authorized = false;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly allowSend: boolean;
  private readonly rpcUrls: Record<number, string>;
  private readonly publicClients = new Map<number, PublicClient>();
  private readonly walletClients = new Map<number, WalletClient>();
  /** Every send this wallet performed, so a spec can assert on spend. */
  readonly sentTransactions: Hex[] = [];

  constructor(options: EvmWalletOptions) {
    this.account = privateKeyToAccount(options.privateKey);
    this.address = this.account.address;
    this.chainId = options.initialChainId ?? sepolia.id;
    this.allowSend = options.allowSend ?? process.env.CCIP_E2E_ALLOW_SEND === "1";
    this.rpcUrls = options.rpcUrls ?? {};
  }

  private chain(chainId: number): Chain {
    const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
    if (!chain) throw new Error(`Unsupported chainId ${chainId}`);
    return chain;
  }

  private transportUrl(chainId: number): string | undefined {
    return this.rpcUrls[chainId];
  }

  private publicClient(chainId: number): PublicClient {
    let client = this.publicClients.get(chainId);
    if (!client) {
      client = createPublicClient({
        chain: this.chain(chainId),
        transport: http(this.transportUrl(chainId)),
      }) as PublicClient;
      this.publicClients.set(chainId, client);
    }
    return client;
  }

  private walletClient(chainId: number): WalletClient {
    let client = this.walletClients.get(chainId);
    if (!client) {
      client = createWalletClient({
        account: this.account,
        chain: this.chain(chainId),
        transport: http(this.transportUrl(chainId)),
      });
      this.walletClients.set(chainId, client);
    }
    return client;
  }

  /** Handles one JSON-RPC call: locally when it needs the key, else via the node. */
  async handle({ method, params = [] }: RpcRequest): Promise<unknown> {
    if (!LOCAL_METHODS.has(method)) {
      return this.publicClient(this.chainId).request({
        method,
        params,
      } as Parameters<PublicClient["request"]>[0]);
    }

    switch (method) {
      // Empty until the dapp has asked once. Returning an account straight away
      // is how a real wallet signals "already authorised", so wagmi reconnects
      // on mount, the connect modal never opens, and a test that expects to pick
      // a wallet finds the app already connected.
      case "eth_accounts":
        return this.authorized ? [this.address] : [];

      case "eth_requestAccounts":
        this.authorized = true;
        return [this.address];

      case "eth_chainId":
        return `0x${this.chainId.toString(16)}`;

      case "net_version":
        return String(this.chainId);

      case "wallet_addEthereumChain":
        return null;

      case "wallet_switchEthereumChain": {
        const target = params[0] as { chainId?: string } | undefined;
        if (!target?.chainId) throw new Error("wallet_switchEthereumChain: missing chainId");
        const next = Number.parseInt(target.chainId, 16);
        this.chain(next); // throws if the app asks for a chain we do not model
        this.chainId = next;
        return null;
      }

      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];

      case "personal_sign": {
        // personal_sign is (message, address); eth_sign is the reverse.
        const message = params[0] as Hex;
        return this.account.signMessage({ message: { raw: message } });
      }

      case "eth_sign": {
        const message = params[1] as Hex;
        return this.account.signMessage({ message: { raw: message } });
      }

      case "eth_signTypedData_v4": {
        const payload = params[1] as string;
        return this.account.signTypedData(
          JSON.parse(payload) as Parameters<typeof this.account.signTypedData>[0]
        );
      }

      case "eth_sendTransaction": {
        if (!this.allowSend) {
          throw new Error(
            "eth_sendTransaction blocked. This wallet holds real testnet funds; " +
              "set CCIP_E2E_ALLOW_SEND=1 to permit spending."
          );
        }
        const tx = params[0] as {
          to?: Hex;
          data?: Hex;
          value?: Hex;
          gas?: Hex;
        };
        const hash = await this.walletClient(this.chainId).sendTransaction({
          account: this.account,
          chain: this.chain(this.chainId),
          to: tx.to ?? null,
          data: tx.data,
          ...(tx.value ? { value: BigInt(tx.value) } : {}),
          ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
        });
        this.sentTransactions.push(hash);
        return hash;
      }

      default:
        throw new Error(`Unhandled local method ${method}`);
    }
  }

  /**
   * Installs the provider on a page. Must run before any app script, so call it
   * before `page.goto`.
   */
  async install(page: Page): Promise<void> {
    await page.exposeFunction(BINDING, (method: string, params: unknown[]) =>
      this.handle({ method, params })
    );

    await page.addInitScript(
      ({ binding, address, chainId }) => {
        type Listener = (payload: unknown) => void;
        const listeners = new Map<string, Set<Listener>>();

        const emit = (event: string, payload: unknown) => {
          for (const fn of listeners.get(event) ?? []) fn(payload);
        };

        const call = (method: string, params: unknown[] = []) =>
          (window as unknown as Record<string, (m: string, p: unknown[]) => Promise<unknown>>)[
            binding
          ]?.(method, params);

        const provider = {
          isMetaMask: true,
          // Some connectors branch on this to skip a wallet-detection race.
          _metamask: { isUnlocked: () => Promise.resolve(true) },
          chainId: `0x${chainId.toString(16)}`,
          selectedAddress: address,

          request: async ({ method, params }: { method: string; params?: unknown[] }) => {
            const result = await call(method, params ?? []);
            if (method === "wallet_switchEthereumChain") {
              const target = (params?.[0] as { chainId: string }).chainId;
              provider.chainId = target;
              emit("chainChanged", target);
            }
            return result;
          },

          on: (event: string, fn: Listener) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)?.add(fn);
            return provider;
          },
          removeListener: (event: string, fn: Listener) => {
            listeners.get(event)?.delete(fn);
            return provider;
          },
          // Legacy aliases some connectors still probe for.
          addListener: (event: string, fn: Listener) => provider.on(event, fn),
          off: (event: string, fn: Listener) => provider.removeListener(event, fn),
        };

        Object.defineProperty(window, "ethereum", {
          value: provider,
          writable: false,
          configurable: true,
        });

        // EIP-6963 is how wagmi and RainbowKit discover wallets; without the
        // announcement the injected provider is often absent from the modal.
        //
        // The rdns must not be a real wallet's. Announcing as `io.metamask` makes
        // RainbowKit merge this into its built-in MetaMask entry and run the
        // extension handshake ("Confirm connection in the extension"), which can
        // never complete because there is no extension. A distinct rdns gets its
        // own entry that connects straight through this provider.
        const info = {
          uuid: "00000000-0000-4000-8000-000000000001",
          name: "E2E Test Wallet",
          rdns: "link.chain.ccip.e2e",
          icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        };
        const announce = () => {
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: Object.freeze({ info, provider }),
            })
          );
        };
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      { binding: BINDING, address: this.address, chainId: this.chainId }
    );
  }
}
