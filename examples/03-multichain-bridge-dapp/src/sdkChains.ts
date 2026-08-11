/**
 * The SDK registers a chain family from a static block on the Chain subclass, so the class must
 * be evaluated before anything decodes an address for that family. A bundler drops a class that
 * is never referenced, so the exported array keeps the reference. Only the three families this
 * app offers are pulled in, rather than `@chainlink/ccip-sdk/all`.
 */

import { AptosChain, EVMChain, SolanaChain } from "@chainlink/ccip-sdk";

export const SUPPORTED_CHAIN_CLASSES: unknown[] = [EVMChain, SolanaChain, AptosChain];
