/**
 * Burst Comparison: Stylus WASM vs EVM Solidity — Per-Block TX Packing
 *
 * Deploys identical sendMessage() bursts against both the Stylus WASM and
 * EVM Solidity messaging contracts, then compares how many transactions
 * each VM can pack per block under the same gas limit.
 *
 * Burst sizes: 50, 100, 200, 500
 * Accounts: Anvil #3–#9 (7 accounts) for parallel nonce-safe submission
 *
 * PRD-003 Scenario 5 target: Stylus >= 30% gas discount vs EVM
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createClients,
  getContractAddress,
  SEND_MESSAGE_ABI,
} from './utils';
import {
  createBurstClients,
  fundAccounts,
  submitBurst,
  buildBurstResult,
  type BurstResult,
} from './burst-utils';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BURST_SIZES = [50, 100, 200, 500];
const MESSAGE_SIZE_BYTES = 64;

function getEvmContractAddress(): `0x${string}` {
  if (process.env.EVM_CONTRACT_ADDRESS) {
    return process.env.EVM_CONTRACT_ADDRESS as `0x${string}`;
  }
  // Fall back to deployment output file
  const deployPath = path.resolve(
    __dirname,
    '../../../chain-config/evmContractAddress.txt',
  );
  if (fs.existsSync(deployPath)) {
    return fs.readFileSync(deployPath, 'utf-8').trim() as `0x${string}`;
  }
  console.error(
    'ERROR: No EVM contract address found. Set EVM_CONTRACT_ADDRESS in .env or deploy via scripts/run-burst-comparison.sh',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Comparison table formatting
// ---------------------------------------------------------------------------

interface ComparisonRow {
  burstSize: number;
  contractType: string;
  avgTxsPerBlock: number;
  maxTxsPerBlock: number;
  avgGasPerTx: bigint;
  tps: number;
  elapsedMs: number;
  successCount: number;
  failedCount: number;
}

function formatComparisonTable(rows: ComparisonRow[]): string {
  const lines: string[] = [
    '',
    '='.repeat(100),
    '  BURST COMPARISON: Stylus WASM vs EVM Solidity',
    '='.repeat(100),
    '  Burst | Contract | OK/Fail | TXs/Block(avg) | TXs/Block(max) | Avg Gas/TX  | Time(s) | TPS',
    '  ------|----------|---------|----------------|----------------|-------------|---------|------',
  ];

  for (const r of rows) {
    const burst = String(r.burstSize).padStart(5);
    const contract = r.contractType.padEnd(8);
    const okFail = `${r.successCount}/${r.failedCount}`.padStart(7);
    const avgBlk = r.avgTxsPerBlock.toFixed(1).padStart(14);
    const maxBlk = String(r.maxTxsPerBlock).padStart(14);
    const avgGas = r.avgGasPerTx.toLocaleString().padStart(11);
    const time = (r.elapsedMs / 1000).toFixed(2).padStart(7);
    const tps = r.tps.toFixed(1).padStart(6);
    lines.push(
      `  ${burst} | ${contract} | ${okFail} | ${avgBlk} | ${maxBlk} | ${avgGas} | ${time} | ${tps}`,
    );
  }

  lines.push('='.repeat(100));
  return lines.join('\n');
}

function formatVerdict(rows: ComparisonRow[]): string {
  // Compare average gas per TX across all burst sizes
  let stylusGasTotal = 0n;
  let stylusCount = 0;
  let evmGasTotal = 0n;
  let evmCount = 0;

  let stylusTxsPerBlock = 0;
  let evmTxsPerBlock = 0;

  for (const r of rows) {
    if (r.contractType === 'Stylus') {
      stylusGasTotal += r.avgGasPerTx;
      stylusCount++;
      stylusTxsPerBlock += r.avgTxsPerBlock;
    } else {
      evmGasTotal += r.avgGasPerTx;
      evmCount++;
      evmTxsPerBlock += r.avgTxsPerBlock;
    }
  }

  const lines: string[] = [];

  if (stylusCount > 0 && evmCount > 0) {
    const avgStylusGas = stylusGasTotal / BigInt(stylusCount);
    const avgEvmGas = evmGasTotal / BigInt(evmCount);
    const avgStylusTxsBlk = stylusTxsPerBlock / stylusCount;
    const avgEvmTxsBlk = evmTxsPerBlock / evmCount;

    const gasDiscount =
      avgEvmGas > 0n
        ? Number(((avgEvmGas - avgStylusGas) * 100n) / avgEvmGas)
        : 0;

    const txsPerBlockRatio =
      avgEvmTxsBlk > 0 ? avgStylusTxsBlk / avgEvmTxsBlk : 0;

    lines.push('');
    lines.push('='.repeat(100));
    lines.push('  VERDICT');
    lines.push('-'.repeat(100));
    lines.push(`  Avg Gas/TX — Stylus: ${avgStylusGas.toLocaleString()}  |  EVM: ${avgEvmGas.toLocaleString()}`);
    lines.push(`  Gas discount (Stylus vs EVM): ${gasDiscount}%`);
    lines.push(`  TXs/Block ratio (Stylus / EVM): ${txsPerBlockRatio.toFixed(2)}x`);
    lines.push('');

    const target = 30;
    const pass = gasDiscount >= target;
    lines.push(
      `  PRD-003 Target: >= ${target}% Stylus gas discount | Actual: ${gasDiscount}% | ${pass ? 'PASS' : 'FAIL'}`,
    );
    lines.push('='.repeat(100));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

interface JsonOutput {
  timestamp: string;
  burstSizes: number[];
  results: Array<{
    contractType: string;
    burstSize: number;
    successCount: number;
    failedCount: number;
    elapsedMs: number;
    tps: number;
    avgTxsPerBlock: number;
    maxTxsPerBlock: number;
    avgGasPerTx: string;
    blockCount: number;
    blockStats: Array<{
      blockNumber: string;
      txCount: number;
      totalGas: string;
    }>;
  }>;
}

function buildJsonOutput(burstResults: BurstResult[]): JsonOutput {
  return {
    timestamp: new Date().toISOString(),
    burstSizes: BURST_SIZES,
    results: burstResults.map((r) => ({
      contractType: r.contractType,
      burstSize: r.burstSize,
      successCount: r.receipts.length,
      failedCount: r.failedCount,
      elapsedMs: r.elapsedMs,
      tps: r.tps,
      avgTxsPerBlock: r.avgTxsPerBlock,
      maxTxsPerBlock: r.maxTxsPerBlock,
      avgGasPerTx: r.avgGasPerTx.toString(),
      blockCount: r.blockStats.length,
      blockStats: r.blockStats.map((b) => ({
        blockNumber: b.blockNumber.toString(),
        txCount: b.txCount,
        totalGas: b.totalGas.toString(),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  Burst Comparison: Stylus WASM vs EVM Solidity');
  console.log('='.repeat(60));

  // Resolve contract addresses
  const stylusAddress = getContractAddress();
  const evmAddress = getEvmContractAddress();
  console.log(`  Stylus contract: ${stylusAddress}`);
  console.log(`  EVM contract:    ${evmAddress}`);

  // Create clients
  const { publicClient, walletClient } = createClients();
  const rpcUrl = process.env.L2_CHAIN_RPC || 'http://localhost:8547';
  const chain = publicClient.chain!;
  const { publicClient: burstPublic, walletClients } = createBurstClients(chain, rpcUrl);

  // Fund burst accounts
  await fundAccounts(burstPublic, walletClient);

  const allResults: BurstResult[] = [];
  const comparisonRows: ComparisonRow[] = [];

  for (const burstSize of BURST_SIZES) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Burst size: ${burstSize} TXs`);
    console.log('─'.repeat(60));

    // --- Stylus burst ---
    console.log(`\n  [Stylus] Submitting ${burstSize} TXs...`);
    const stylusRaw = await submitBurst(
      burstPublic,
      walletClients,
      stylusAddress,
      SEND_MESSAGE_ABI,
      burstSize,
      MESSAGE_SIZE_BYTES,
    );
    const stylusResult = buildBurstResult(
      'Stylus',
      burstSize,
      stylusRaw.receipts,
      stylusRaw.failedCount,
      stylusRaw.elapsedMs,
    );
    allResults.push(stylusResult);
    comparisonRows.push({
      burstSize,
      contractType: 'Stylus',
      avgTxsPerBlock: stylusResult.avgTxsPerBlock,
      maxTxsPerBlock: stylusResult.maxTxsPerBlock,
      avgGasPerTx: stylusResult.avgGasPerTx,
      tps: stylusResult.tps,
      elapsedMs: stylusResult.elapsedMs,
      successCount: stylusResult.receipts.length,
      failedCount: stylusResult.failedCount,
    });
    console.log(
      `  [Stylus] Done: ${stylusResult.receipts.length} OK, ${stylusResult.failedCount} failed, ` +
        `${stylusResult.tps.toFixed(1)} TPS, avg ${stylusResult.avgGasPerTx} gas/TX, ` +
        `${stylusResult.avgTxsPerBlock.toFixed(1)} TXs/block avg`,
    );

    // Brief pause between contract bursts to let pending state settle
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // --- EVM burst ---
    console.log(`\n  [EVM] Submitting ${burstSize} TXs...`);
    const evmRaw = await submitBurst(
      burstPublic,
      walletClients,
      evmAddress,
      SEND_MESSAGE_ABI,
      burstSize,
      MESSAGE_SIZE_BYTES,
    );
    const evmResult = buildBurstResult(
      'EVM',
      burstSize,
      evmRaw.receipts,
      evmRaw.failedCount,
      evmRaw.elapsedMs,
    );
    allResults.push(evmResult);
    comparisonRows.push({
      burstSize,
      contractType: 'EVM',
      avgTxsPerBlock: evmResult.avgTxsPerBlock,
      maxTxsPerBlock: evmResult.maxTxsPerBlock,
      avgGasPerTx: evmResult.avgGasPerTx,
      tps: evmResult.tps,
      elapsedMs: evmResult.elapsedMs,
      successCount: evmResult.receipts.length,
      failedCount: evmResult.failedCount,
    });
    console.log(
      `  [EVM] Done: ${evmResult.receipts.length} OK, ${evmResult.failedCount} failed, ` +
        `${evmResult.tps.toFixed(1)} TPS, avg ${evmResult.avgGasPerTx} gas/TX, ` +
        `${evmResult.avgTxsPerBlock.toFixed(1)} TXs/block avg`,
    );

    // Pause between burst sizes
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Print comparison table
  console.log(formatComparisonTable(comparisonRows));
  console.log(formatVerdict(comparisonRows));

  // Write JSON output
  const jsonOutput = buildJsonOutput(allResults);
  const outPath = path.resolve(__dirname, '../burst-results.json');
  fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`  Results written to: ${outPath}`);
}

// Allow direct invocation
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Burst comparison crashed:', err);
    process.exit(1);
  });
