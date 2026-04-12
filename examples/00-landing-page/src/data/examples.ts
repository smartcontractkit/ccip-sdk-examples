export interface ExampleMeta {
  id: string;
  number: string;
  title: string;
  description: string;
  runtime: "Browser" | "Node.js";
  tags: string[];
  appPath?: string;
  sourceUrl?: string;
}

const GITHUB_BASE = "https://github.com/smartcontractkit/ccip-sdk-examples/tree/main/examples";

export const EXAMPLES: ExampleMeta[] = [
  {
    id: "01-getting-started",
    number: "01",
    title: "Getting Started",
    description:
      "SDK basics: discover chains, estimate fees, inspect token pools, and execute cross-chain transfers from the CLI.",
    runtime: "Node.js",
    tags: ["CLI", "EVM", "Solana", "Aptos", "fees", "pools"],
    sourceUrl: `${GITHUB_BASE}/01-getting-started`,
  },
  {
    id: "02-evm-simple-bridge",
    number: "02",
    title: "EVM Simple Bridge",
    description:
      "EVM-to-EVM token bridge with fee token selection. Uses sendMessage() where the SDK handles approval and send.",
    runtime: "Browser",
    tags: ["EVM", "wagmi", "RainbowKit", "sendMessage"],
    appPath: "/02-evm-simple-bridge/",
    sourceUrl: `${GITHUB_BASE}/02-evm-simple-bridge`,
  },
  {
    id: "03-multichain-bridge-dapp",
    number: "03",
    title: "Multichain Bridge DApp",
    description:
      "EVM + Solana + Aptos bridge with multiple wallet adapters. Uses generateUnsignedSendMessage() for explicit signing control.",
    runtime: "Browser",
    tags: ["EVM", "Solana", "Aptos", "multichain"],
    appPath: "/03-multichain-bridge-dapp/",
    sourceUrl: `${GITHUB_BASE}/03-multichain-bridge-dapp`,
  },
  {
    id: "04-hardhat-ccip",
    number: "04",
    title: "Hardhat CCIP",
    description:
      "Custom Sender/Receiver contracts with Hardhat v3. SDK-assisted gas estimation, fee quoting, extraArgs encoding, and manual execution.",
    runtime: "Node.js",
    tags: ["Hardhat", "Solidity", "contracts", "gas estimation"],
    sourceUrl: `${GITHUB_BASE}/04-hardhat-ccip`,
  },
];
