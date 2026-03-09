/**
 * Educational annotations and code signatures for each SDK method call.
 * Content is specific to Example 03's transfer flow.
 *
 * Each entry contains:
 * - annotation: educational "what" + "whyNow" text
 * - codeSnippet: clean function signature with named parameters
 *
 * Actual argument values are shown separately in the "Arguments" section
 * of the inspector UI via `displayArgs`.
 */

import type { LogSDKCallOptions } from "@ccip-examples/shared-utils/inspector";

type Annotation = Pick<LogSDKCallOptions, "annotation" | "codeSnippet">;

const annotations: Record<string, Annotation> = {
  createChain: {
    annotation: {
      what: "Create a Chain instance connected to the network's RPC endpoint",
      whyNow: "Chain instance is the entry point for all SDK operations on this network",
    },
    codeSnippet:
      "// Per chain family:\nconst chain = EVMChain.fromUrl(rpcUrl);\nconst chain = SolanaChain.fromUrl(rpcUrl);\nconst chain = AptosChain.fromUrl(rpcUrl);",
  },
  MessageInput: {
    annotation: {
      what: "Construct the CCIP MessageInput object",
      whyNow:
        "This is the SDK's MessageInput shape -- passed to getFee() and generateUnsignedSendMessage()",
    },
    codeSnippet:
      "const message: MessageInput = {\n  receiver,\n  tokenAmounts: [{ token: tokenAddress, amount }],\n  feeToken, // optional\n};",
  },
  networkInfo: {
    annotation: {
      what: "Fetch CCIP network metadata (chain selector, family, type)",
      whyNow: "Chain selector is CCIP's unique identifier -- needed for every cross-chain call",
    },
    codeSnippet: "const { chainSelector } = networkInfo(networkId);",
  },
  "chain.getTokenInfo": {
    annotation: {
      what: "Validate token and fetch metadata (decimals, symbol, name)",
      whyNow: "Decimals required to convert human-readable amount to raw integer",
    },
    codeSnippet: "const tokenInfo = await chain.getTokenInfo(tokenAddress);",
  },
  "chain.getFee": {
    annotation: {
      what: "Query CCIP router for exact transfer fee on-chain",
      whyNow: "Fees are dynamic -- depend on destination, token, amount, and network conditions",
    },
    codeSnippet:
      "const fee = await chain.getFee({\n  router,\n  destChainSelector,\n  message,\n});",
  },
  "chain.getLaneLatency": {
    annotation: {
      what: "Estimate delivery time for this source -> destination route",
      whyNow: "Show user expected wait time before they commit funds",
    },
    codeSnippet: "const latency = await chain.getLaneLatency(destChainSelector);",
  },
  "chain.getBalance": {
    annotation: {
      what: "Check token balance for an address on-chain",
      whyNow: "Track balances before/after transfer to confirm delivery",
    },
    codeSnippet: "const balance = await chain.getBalance({\n  holder,\n  token,\n});",
  },
  "chain.generateUnsignedSendMessage": {
    annotation: {
      what: "Build the cross-chain transaction for wallet signing",
      whyNow: "THE key SDK call -- everything before was preparation for this moment",
    },
    codeSnippet:
      "const unsignedTx = await chain.generateUnsignedSendMessage({\n  sender,\n  router,\n  destChainSelector,\n  message: { ...message, fee },\n});",
  },
  "chain.getTokenAdminRegistryFor": {
    annotation: {
      what: "Find the token admin registry for this CCIP router",
      whyNow: "Registry holds the mapping from token -> token pool",
    },
    codeSnippet: "const registry = await chain.getTokenAdminRegistryFor(routerAddress);",
  },
  "chain.getRegistryTokenConfig": {
    annotation: {
      what: "Look up token pool address from the registry",
      whyNow: "Token pool manages cross-chain liquidity for this token",
    },
    codeSnippet:
      "const config = await chain.getRegistryTokenConfig(\n  registryAddress,\n  tokenAddress,\n);",
  },
  "chain.getTokenPoolRemote": {
    annotation: {
      what: "Find the token's address on the destination chain",
      whyNow: "Destination token may have a different address than source",
    },
    codeSnippet:
      "const remote = await chain.getTokenPoolRemote(\n  poolAddress,\n  destChainSelector,\n);",
  },
  "chain.getFeeTokens": {
    annotation: {
      what: "Fetch accepted fee payment tokens from the CCIP router",
      whyNow: "Users can pay fees in native token or LINK -- need to show available options",
    },
    codeSnippet: "const feeTokens = await chain.getFeeTokens(routerAddress);",
  },
  "chain.getTokenPoolConfig": {
    annotation: {
      what: "Fetch token pool configuration (type, version, supported chains)",
      whyNow: "Pool type determines the lock/burn mechanism used for cross-chain transfers",
    },
    codeSnippet: "const poolConfig = await chain.getTokenPoolConfig(poolAddress);",
  },
  "chain.getMessagesInTx": {
    annotation: {
      what: "Extract CCIP message IDs from a confirmed transaction",
      whyNow: "Message ID is needed to track cross-chain delivery status",
    },
    codeSnippet: "const messages = await chain.getMessagesInTx(txHash);",
  },
  "chain.getTransaction": {
    annotation: {
      what: "Fetch full transaction data from the chain",
      whyNow: "Non-EVM chains need the full transaction object to extract CCIP messages",
    },
    codeSnippet: "const tx = await chain.getTransaction(txHash);",
  },
  "CCIPAPIClient.getMessageById": {
    annotation: {
      what: "Poll CCIP API for cross-chain message status",
      whyNow: "Track progress through CCIP lifecycle statuses until delivery completes",
    },
    codeSnippet: "const msg = await apiClient.getMessageById(messageId);",
  },
};

const FALLBACK: Annotation = {
  annotation: { what: "SDK call", whyNow: "" },
  codeSnippet: "",
};

/** Get annotation and code snippet for a method, with a safe fallback */
export function getAnnotation(method: string): Annotation {
  return annotations[method] ?? FALLBACK;
}
