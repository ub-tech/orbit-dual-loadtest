/**
 * burst-utils.ts — Shared utilities for multi-account burst testing.
 *
 * Provides Anvil account management, round-robin TX submission, and
 * per-block receipt analysis for the Stylus-vs-EVM comparison test.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseEther,
  type Abi,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getL2Chain, generateMessage, SEND_MESSAGE_ABI } from './utils';

// ---------------------------------------------------------------------------
// Anvil accounts #3–#9 for parallel burst submission
// ---------------------------------------------------------------------------

interface BurstAccount {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

export const ANVIL_ACCOUNTS: BurstAccount[] = [
  {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  },
  {
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  },
  {
    address: '0x14dC79964da2C08dA15Fd60A5BA34eFe21B7Adb9',
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  },
  {
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  },
  {
    address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockStats {
  blockNumber: bigint;
  txCount: number;
  totalGas: bigint;
}

export interface BurstResult {
  contractType: string;
  burstSize: number;
  receipts: TransactionReceipt[];
  failedCount: number;
  elapsedMs: number;
  blockStats: BlockStats[];
  avgTxsPerBlock: number;
  maxTxsPerBlock: number;
  avgGasPerTx: bigint;
  tps: number;
}

// ---------------------------------------------------------------------------
// Client creation for burst accounts
// ---------------------------------------------------------------------------

export function createBurstClients(chain: Chain, rpcUrl: string) {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const walletClients = ANVIL_ACCOUNTS.map((acct) => {
    const account = privateKeyToAccount(acct.privateKey);
    return createWalletClient({
      chain,
      transport: http(rpcUrl),
      account,
    });
  });

  return { publicClient, walletClients };
}

// ---------------------------------------------------------------------------
// Fund burst accounts
// ---------------------------------------------------------------------------

/**
 * Transfer ETH from a funder wallet to each burst account.
 */
export async function fundAccounts(
  publicClient: PublicClient,
  funderWallet: WalletClient,
  amount: bigint = parseEther('1'),
): Promise<void> {
  console.log(`  Funding ${ANVIL_ACCOUNTS.length} burst accounts with ${amount} wei each...`);

  for (const acct of ANVIL_ACCOUNTS) {
    const balance = await publicClient.getBalance({ address: acct.address });
    if (balance >= amount) {
      continue; // Already funded
    }

    const hash = await funderWallet.sendTransaction({
      to: acct.address,
      value: amount,
      chain: funderWallet.chain,
      account: funderWallet.account!,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  console.log('  All burst accounts funded.');
}

// ---------------------------------------------------------------------------
// Submit a burst of transactions
// ---------------------------------------------------------------------------

/**
 * Distribute `burstSize` TXs round-robin across wallet clients, each with
 * pre-assigned nonces. Returns confirmed receipts and failure count.
 */
export async function submitBurst(
  publicClient: PublicClient,
  walletClients: WalletClient[],
  contractAddress: `0x${string}`,
  abi: typeof SEND_MESSAGE_ABI,
  burstSize: number,
  messageSizeBytes: number = 64,
): Promise<{ receipts: TransactionReceipt[]; failedCount: number; elapsedMs: number }> {
  const numAccounts = walletClients.length;

  // Pre-fetch nonces for each account
  const nonces: number[] = await Promise.all(
    walletClients.map((wc) =>
      publicClient.getTransactionCount({
        address: wc.account!.address,
        blockTag: 'pending',
      }),
    ),
  );

  // Build TX assignments: round-robin across accounts
  const assignments: { walletIndex: number; nonce: number; message: string }[] = [];
  for (let i = 0; i < burstSize; i++) {
    const walletIndex = i % numAccounts;
    const nonce = nonces[walletIndex];
    nonces[walletIndex]++;
    assignments.push({
      walletIndex,
      nonce,
      message: generateMessage(messageSizeBytes),
    });
  }

  // Fire all TXs simultaneously
  const startTime = performance.now();

  const txPromises = assignments.map(async ({ walletIndex, nonce, message }) => {
    const wc = walletClients[walletIndex];
    const hash = await wc.writeContract({
      address: contractAddress,
      abi,
      functionName: 'sendMessage',
      args: [message],
      nonce,
      chain: wc.chain,
      account: wc.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
  });

  const settled = await Promise.allSettled(txPromises);
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;

  const receipts: TransactionReceipt[] = [];
  let failedCount = 0;

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      receipts.push(result.value);
    } else {
      failedCount++;
    }
  }

  return { receipts, failedCount, elapsedMs };
}

// ---------------------------------------------------------------------------
// Generic burst — parameterized for any contract function
// ---------------------------------------------------------------------------

/**
 * Submit a burst of TXs calling an arbitrary contract function.
 *
 * Same round-robin nonce management as `submitBurst`, but accepts any ABI,
 * function name, and an args generator so it works for non-messaging contracts.
 */
export async function submitGenericBurst(
  publicClient: PublicClient,
  walletClients: WalletClient[],
  contractAddress: `0x${string}`,
  abi: Abi,
  functionName: string,
  burstSize: number,
  argsGenerator: (index: number) => unknown[],
): Promise<{ receipts: TransactionReceipt[]; failedCount: number; elapsedMs: number }> {
  const numAccounts = walletClients.length;

  // Pre-fetch nonces for each account
  const nonces: number[] = await Promise.all(
    walletClients.map((wc) =>
      publicClient.getTransactionCount({
        address: wc.account!.address,
        blockTag: 'pending',
      }),
    ),
  );

  // Build TX assignments: round-robin across accounts
  const assignments: { walletIndex: number; nonce: number; args: unknown[] }[] = [];
  for (let i = 0; i < burstSize; i++) {
    const walletIndex = i % numAccounts;
    const nonce = nonces[walletIndex];
    nonces[walletIndex]++;
    assignments.push({
      walletIndex,
      nonce,
      args: argsGenerator(i),
    });
  }

  // Fire all TXs simultaneously
  const startTime = performance.now();

  const txPromises = assignments.map(async ({ walletIndex, nonce, args }) => {
    const wc = walletClients[walletIndex];
    const hash = await wc.writeContract({
      address: contractAddress,
      abi,
      functionName,
      args,
      nonce,
      chain: wc.chain,
      account: wc.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
  });

  const settled = await Promise.allSettled(txPromises);
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;

  const receipts: TransactionReceipt[] = [];
  let failedCount = 0;

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      receipts.push(result.value);
    } else {
      failedCount++;
    }
  }

  return { receipts, failedCount, elapsedMs };
}

// ---------------------------------------------------------------------------
// Per-block analysis
// ---------------------------------------------------------------------------

/**
 * Group receipts by blockNumber and compute per-block TX count and gas totals.
 */
export function analyzeBlocks(receipts: TransactionReceipt[]): BlockStats[] {
  const blockMap = new Map<bigint, { txCount: number; totalGas: bigint }>();

  for (const receipt of receipts) {
    const existing = blockMap.get(receipt.blockNumber) || { txCount: 0, totalGas: 0n };
    existing.txCount++;
    existing.totalGas += receipt.gasUsed;
    blockMap.set(receipt.blockNumber, existing);
  }

  const stats: BlockStats[] = [];
  for (const [blockNumber, data] of blockMap) {
    stats.push({ blockNumber, ...data });
  }

  return stats.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
}

/**
 * Build a full BurstResult from raw receipts and timing data.
 */
export function buildBurstResult(
  contractType: string,
  burstSize: number,
  receipts: TransactionReceipt[],
  failedCount: number,
  elapsedMs: number,
): BurstResult {
  const blockStats = analyzeBlocks(receipts);

  const txCounts = blockStats.map((b) => b.txCount);
  const avgTxsPerBlock =
    txCounts.length > 0
      ? txCounts.reduce((a, b) => a + b, 0) / txCounts.length
      : 0;
  const maxTxsPerBlock =
    txCounts.length > 0 ? Math.max(...txCounts) : 0;

  const totalGas = receipts.reduce((sum, r) => sum + r.gasUsed, 0n);
  const avgGasPerTx = receipts.length > 0 ? totalGas / BigInt(receipts.length) : 0n;

  const successCount = receipts.length;
  const tps = elapsedMs > 0 ? (successCount / elapsedMs) * 1000 : 0;

  return {
    contractType,
    burstSize,
    receipts,
    failedCount,
    elapsedMs,
    blockStats,
    avgTxsPerBlock,
    maxTxsPerBlock,
    avgGasPerTx,
    tps,
  };
}
