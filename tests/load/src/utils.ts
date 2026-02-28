import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type HttpTransport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ---------------------------------------------------------------------------
// Contract ABIs
// ---------------------------------------------------------------------------

export const SEND_MESSAGE_ABI = [
  {
    type: 'function',
    name: 'sendMessage',
    inputs: [{ name: 'content', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

export const MESSAGE_COUNT_ABI = [
  {
    type: 'function',
    name: 'messageCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadTestResult {
  scenario: string;
  totalTxs: number;
  successfulTxs: number;
  failedTxs: number;
  elapsedMs: number;
  tps: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p99LatencyMs: number;
  gasUsed?: bigint[];
  avgGas?: bigint;
  extras?: Record<string, unknown>;
}

export interface WindowStats {
  windowIndex: number;
  startSec: number;
  endSec: number;
  txCount: number;
  tps: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getContractAddress(): `0x${string}` {
  // Try environment variable first
  if (process.env.MESSAGING_CONTRACT_ADDRESS) {
    return process.env.MESSAGING_CONTRACT_ADDRESS as `0x${string}`;
  }
  // Fall back to a deployment output file
  const deployPath = path.resolve(
    __dirname,
    '../../../chain-config/contractAddress.txt',
  );
  if (fs.existsSync(deployPath)) {
    return fs.readFileSync(deployPath, 'utf-8').trim() as `0x${string}`;
  }
  console.error(
    'ERROR: No contract address found. Set MESSAGING_CONTRACT_ADDRESS in .env or deploy the contract first.',
  );
  process.exit(1);
}

/**
 * Build the custom L2 chain definition from environment variables.
 */
export function getL2Chain(): Chain {
  const rpc = process.env.L2_CHAIN_RPC || 'http://localhost:8547';
  const chainId = Number(process.env.CHAIN_ID || '97400766');
  const chainName = process.env.CHAIN_NAME || 'omega-messaging-chain';

  return defineChain({
    id: chainId,
    name: chainName,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [rpc] },
    },
  });
}

/**
 * Create viem public and wallet clients from environment configuration.
 */
export function createClients() {
  const rpc = process.env.L2_CHAIN_RPC || 'http://localhost:8547';
  const key = process.env.TEST_USER_PRIVATE_KEY;
  if (!key) {
    console.error('ERROR: TEST_USER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const normalizedKey: `0x${string}` = key.startsWith('0x')
    ? (key as `0x${string}`)
    : (`0x${key}` as `0x${string}`);

  const account = privateKeyToAccount(normalizedKey);
  const chain = getL2Chain();

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });

  const walletClient = createWalletClient({
    chain,
    transport: http(rpc),
    account,
  });

  return { publicClient, walletClient, account, chain };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random alphanumeric string of the specified byte length.
 */
export function generateMessage(sizeBytes: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < sizeBytes; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Compute the p-th percentile from a sorted array of numbers.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}

/**
 * Build a LoadTestResult from raw latency and gas arrays.
 */
export function buildResult(
  scenario: string,
  totalTxs: number,
  latencies: number[],
  elapsedMs: number,
  gasUsed: bigint[],
  extras?: Record<string, unknown>,
): LoadTestResult {
  const successfulTxs = latencies.length;
  const failedTxs = totalTxs - successfulTxs;
  const sorted = [...latencies].sort((a, b) => a - b);

  const avgLatencyMs =
    sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  const minLatencyMs = sorted.length > 0 ? sorted[0] : 0;
  const maxLatencyMs = sorted.length > 0 ? sorted[sorted.length - 1] : 0;

  const tps = elapsedMs > 0 ? (successfulTxs / elapsedMs) * 1000 : 0;

  const avgGas =
    gasUsed.length > 0
      ? gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length)
      : undefined;

  return {
    scenario,
    totalTxs,
    successfulTxs,
    failedTxs,
    elapsedMs,
    tps,
    avgLatencyMs,
    minLatencyMs,
    maxLatencyMs,
    p50LatencyMs: percentile(sorted, 50),
    p90LatencyMs: percentile(sorted, 90),
    p99LatencyMs: percentile(sorted, 99),
    gasUsed,
    avgGas,
    extras,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatResult(result: LoadTestResult): string {
  const lines = [
    `\n${'='.repeat(60)}`,
    `  ${result.scenario}`,
    `${'='.repeat(60)}`,
    `  Transactions : ${result.successfulTxs}/${result.totalTxs} (${result.failedTxs} failed)`,
    `  Elapsed      : ${(result.elapsedMs / 1000).toFixed(2)}s`,
    `  TPS          : ${result.tps.toFixed(2)}`,
    `  Latency:`,
    `    avg : ${result.avgLatencyMs.toFixed(1)}ms`,
    `    min : ${result.minLatencyMs.toFixed(1)}ms`,
    `    p50 : ${result.p50LatencyMs.toFixed(1)}ms`,
    `    p90 : ${result.p90LatencyMs.toFixed(1)}ms`,
    `    p99 : ${result.p99LatencyMs.toFixed(1)}ms`,
    `    max : ${result.maxLatencyMs.toFixed(1)}ms`,
  ];
  if (result.avgGas !== undefined) {
    lines.push(`  Avg Gas      : ${result.avgGas.toString()}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Serialize a LoadTestResult to a JSON-safe object (bigint → string).
 */
export function resultToJson(result: LoadTestResult): Record<string, unknown> {
  return {
    scenario: result.scenario,
    totalTxs: result.totalTxs,
    successfulTxs: result.successfulTxs,
    failedTxs: result.failedTxs,
    elapsedMs: result.elapsedMs,
    tps: result.tps,
    avgLatencyMs: result.avgLatencyMs,
    minLatencyMs: result.minLatencyMs,
    maxLatencyMs: result.maxLatencyMs,
    p50LatencyMs: result.p50LatencyMs,
    p90LatencyMs: result.p90LatencyMs,
    p99LatencyMs: result.p99LatencyMs,
    avgGas: result.avgGas !== undefined ? result.avgGas.toString() : null,
    extras: result.extras ?? null,
  };
}
