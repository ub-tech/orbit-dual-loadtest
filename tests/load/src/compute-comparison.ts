/**
 * Compute Comparison: Stylus WASM vs EVM — Iterated Keccak256
 *
 * Runs iterated keccak256 hashing with minimal storage (1 SSTORE per call) to
 * isolate WASM computation cost from storage overhead. Stylus's ink metering
 * should produce a clear gas advantage for pure computation workloads.
 *
 * Iteration tiers: [100, 500, 1000, 2000]
 * Fixed burst size: 100 TXs per tier
 * Accounts: Anvil #3–#9 (7 accounts) for parallel nonce-safe submission
 *
 * PRD-003 target: Stylus >= 30% gas discount vs EVM for compute workloads
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Abi } from 'viem';
import { createClients } from './utils';
import {
  createBurstClients,
  fundAccounts,
  submitGenericBurst,
  buildBurstResult,
  type BurstResult,
} from './burst-utils';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ITERATION_TIERS = [100, 500, 1000, 2000];
const BURST_SIZE = 100;

const COMPUTE_HASH_ABI: Abi = [
  {
    type: 'function',
    name: 'computeHash',
    inputs: [{ name: 'iterations', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
];

const CALL_COUNT_ABI: Abi = [
  {
    type: 'function',
    name: 'callCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

// ---------------------------------------------------------------------------
// Address resolution
// ---------------------------------------------------------------------------

function getComputeStylusAddress(): `0x${string}` {
  if (process.env.COMPUTE_STYLUS_ADDRESS) {
    return process.env.COMPUTE_STYLUS_ADDRESS as `0x${string}`;
  }
  const deployPath = path.resolve(
    __dirname,
    '../../../chain-config/computeStylusAddress.txt',
  );
  if (fs.existsSync(deployPath)) {
    return fs.readFileSync(deployPath, 'utf-8').trim() as `0x${string}`;
  }
  console.error(
    'ERROR: No Stylus compute address found. Set COMPUTE_STYLUS_ADDRESS or deploy via scripts/run-compute-comparison.sh',
  );
  process.exit(1);
}

function getComputeEvmAddress(): `0x${string}` {
  if (process.env.COMPUTE_EVM_ADDRESS) {
    return process.env.COMPUTE_EVM_ADDRESS as `0x${string}`;
  }
  const deployPath = path.resolve(
    __dirname,
    '../../../chain-config/computeEvmAddress.txt',
  );
  if (fs.existsSync(deployPath)) {
    return fs.readFileSync(deployPath, 'utf-8').trim() as `0x${string}`;
  }
  console.error(
    'ERROR: No EVM compute address found. Set COMPUTE_EVM_ADDRESS or deploy via scripts/run-compute-comparison.sh',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Comparison table formatting
// ---------------------------------------------------------------------------

interface ComparisonRow {
  iterations: number;
  contractType: string;
  successCount: number;
  failedCount: number;
  avgGasPerTx: bigint;
  gasSavedPct: number | null;
  tps: number;
  elapsedMs: number;
}

function formatComparisonTable(rows: ComparisonRow[]): string {
  const lines: string[] = [
    '',
    '='.repeat(105),
    '  COMPUTE COMPARISON: Stylus WASM vs EVM — Iterated Keccak256',
    '='.repeat(105),
    '  Iters | Contract | OK/Fail | Avg Gas/TX    | Gas Saved % | TPS    | Time(s)',
    '  ------|----------|---------|---------------|-------------|--------|--------',
  ];

  for (const r of rows) {
    const iters = String(r.iterations).padStart(5);
    const contract = r.contractType.padEnd(8);
    const okFail = `${r.successCount}/${r.failedCount}`.padStart(7);
    const avgGas = r.avgGasPerTx.toLocaleString().padStart(13);
    const saved = r.gasSavedPct !== null
      ? `${r.gasSavedPct.toFixed(1)}%`.padStart(11)
      : '        N/A';
    const tps = r.tps.toFixed(1).padStart(6);
    const time = (r.elapsedMs / 1000).toFixed(2).padStart(7);
    lines.push(
      `  ${iters} | ${contract} | ${okFail} | ${avgGas} | ${saved} | ${tps} | ${time}`,
    );
  }

  lines.push('='.repeat(105));
  return lines.join('\n');
}

function formatVerdict(rows: ComparisonRow[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('='.repeat(105));
  lines.push('  VERDICT — Per-Tier Breakdown');
  lines.push('-'.repeat(105));

  let totalStylusGas = 0n;
  let totalEvmGas = 0n;
  let stylusCount = 0;
  let evmCount = 0;

  // Group by iteration tier
  const tiers = new Map<number, { stylus?: ComparisonRow; evm?: ComparisonRow }>();
  for (const r of rows) {
    const tier = tiers.get(r.iterations) || {};
    if (r.contractType === 'Stylus') {
      tier.stylus = r;
      totalStylusGas += r.avgGasPerTx;
      stylusCount++;
    } else {
      tier.evm = r;
      totalEvmGas += r.avgGasPerTx;
      evmCount++;
    }
    tiers.set(r.iterations, tier);
  }

  for (const [iters, tier] of tiers) {
    if (tier.stylus && tier.evm) {
      const discount = tier.evm.avgGasPerTx > 0n
        ? Number(((tier.evm.avgGasPerTx - tier.stylus.avgGasPerTx) * 100n) / tier.evm.avgGasPerTx)
        : 0;
      lines.push(
        `  ${iters} iters: Stylus ${tier.stylus.avgGasPerTx.toLocaleString()} gas  |  ` +
          `EVM ${tier.evm.avgGasPerTx.toLocaleString()} gas  |  Discount: ${discount}%`,
      );
    }
  }

  if (stylusCount > 0 && evmCount > 0) {
    const avgStylusGas = totalStylusGas / BigInt(stylusCount);
    const avgEvmGas = totalEvmGas / BigInt(evmCount);
    const avgDiscount = avgEvmGas > 0n
      ? Number(((avgEvmGas - avgStylusGas) * 100n) / avgEvmGas)
      : 0;

    lines.push('');
    lines.push(
      `  Overall Avg — Stylus: ${avgStylusGas.toLocaleString()} gas  |  EVM: ${avgEvmGas.toLocaleString()} gas`,
    );
    lines.push(`  Average gas discount (Stylus vs EVM): ${avgDiscount}%`);
    lines.push('');

    const target = 30;
    const pass = avgDiscount >= target;
    lines.push(
      `  PRD-003 Target: >= ${target}% Stylus gas discount | Actual: ${avgDiscount}% | ${pass ? 'PASS' : 'FAIL'}`,
    );
  }

  lines.push('='.repeat(105));
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

interface JsonOutput {
  timestamp: string;
  testType: string;
  burstSize: number;
  iterationTiers: number[];
  results: Array<{
    iterations: number;
    contractType: string;
    successCount: number;
    failedCount: number;
    elapsedMs: number;
    tps: number;
    avgGasPerTx: string;
    gasSavedPct: number | null;
    blockCount: number;
    blockStats: Array<{
      blockNumber: string;
      txCount: number;
      totalGas: string;
    }>;
  }>;
}

function buildJsonOutput(
  rows: ComparisonRow[],
  burstResults: BurstResult[],
): JsonOutput {
  return {
    timestamp: new Date().toISOString(),
    testType: 'compute-comparison',
    burstSize: BURST_SIZE,
    iterationTiers: ITERATION_TIERS,
    results: rows.map((r, i) => {
      const br = burstResults[i];
      return {
        iterations: r.iterations,
        contractType: r.contractType,
        successCount: r.successCount,
        failedCount: r.failedCount,
        elapsedMs: r.elapsedMs,
        tps: r.tps,
        avgGasPerTx: r.avgGasPerTx.toString(),
        gasSavedPct: r.gasSavedPct,
        blockCount: br.blockStats.length,
        blockStats: br.blockStats.map((b) => ({
          blockNumber: b.blockNumber.toString(),
          txCount: b.txCount,
          totalGas: b.totalGas.toString(),
        })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('  Compute Comparison: Stylus WASM vs EVM — Iterated Keccak256');
  console.log('='.repeat(65));

  // Resolve contract addresses
  const stylusAddress = getComputeStylusAddress();
  const evmAddress = getComputeEvmAddress();
  console.log(`  Stylus compute: ${stylusAddress}`);
  console.log(`  EVM compute:    ${evmAddress}`);
  console.log(`  Burst size:     ${BURST_SIZE} TXs per tier`);
  console.log(`  Iteration tiers: ${ITERATION_TIERS.join(', ')}`);

  // Create clients
  const { publicClient, walletClient } = createClients();
  const rpcUrl = process.env.L2_CHAIN_RPC || 'http://localhost:8547';
  const chain = publicClient.chain!;
  const { publicClient: burstPublic, walletClients } = createBurstClients(chain, rpcUrl);

  // Fund burst accounts
  await fundAccounts(burstPublic, walletClient);

  const allResults: BurstResult[] = [];
  const comparisonRows: ComparisonRow[] = [];

  for (const iterations of ITERATION_TIERS) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`  Iteration tier: ${iterations} hashes per TX`);
    console.log('─'.repeat(65));

    // --- Stylus burst ---
    console.log(`\n  [Stylus] Submitting ${BURST_SIZE} TXs (${iterations} iters each)...`);
    const stylusRaw = await submitGenericBurst(
      burstPublic,
      walletClients,
      stylusAddress,
      COMPUTE_HASH_ABI,
      'computeHash',
      BURST_SIZE,
      () => [BigInt(iterations)],
    );
    const stylusResult = buildBurstResult(
      'Stylus',
      BURST_SIZE,
      stylusRaw.receipts,
      stylusRaw.failedCount,
      stylusRaw.elapsedMs,
    );
    allResults.push(stylusResult);

    console.log(
      `  [Stylus] Done: ${stylusResult.receipts.length} OK, ${stylusResult.failedCount} failed, ` +
        `${stylusResult.tps.toFixed(1)} TPS, avg ${stylusResult.avgGasPerTx} gas/TX`,
    );

    // Brief pause between contract bursts
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // --- EVM burst ---
    console.log(`\n  [EVM] Submitting ${BURST_SIZE} TXs (${iterations} iters each)...`);
    const evmRaw = await submitGenericBurst(
      burstPublic,
      walletClients,
      evmAddress,
      COMPUTE_HASH_ABI,
      'computeHash',
      BURST_SIZE,
      () => [BigInt(iterations)],
    );
    const evmResult = buildBurstResult(
      'EVM',
      BURST_SIZE,
      evmRaw.receipts,
      evmRaw.failedCount,
      evmRaw.elapsedMs,
    );
    allResults.push(evmResult);

    console.log(
      `  [EVM] Done: ${evmResult.receipts.length} OK, ${evmResult.failedCount} failed, ` +
        `${evmResult.tps.toFixed(1)} TPS, avg ${evmResult.avgGasPerTx} gas/TX`,
    );

    // Compute gas saved % for this tier
    const gasSavedPct = evmResult.avgGasPerTx > 0n
      ? Number(((evmResult.avgGasPerTx - stylusResult.avgGasPerTx) * 100n) / evmResult.avgGasPerTx)
      : null;

    comparisonRows.push({
      iterations,
      contractType: 'Stylus',
      successCount: stylusResult.receipts.length,
      failedCount: stylusResult.failedCount,
      avgGasPerTx: stylusResult.avgGasPerTx,
      gasSavedPct,
      tps: stylusResult.tps,
      elapsedMs: stylusResult.elapsedMs,
    });

    comparisonRows.push({
      iterations,
      contractType: 'EVM',
      successCount: evmResult.receipts.length,
      failedCount: evmResult.failedCount,
      avgGasPerTx: evmResult.avgGasPerTx,
      gasSavedPct: null,
      tps: evmResult.tps,
      elapsedMs: evmResult.elapsedMs,
    });

    // Pause between tiers
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Print comparison table and verdict
  console.log(formatComparisonTable(comparisonRows));
  console.log(formatVerdict(comparisonRows));

  // Write JSON output
  const jsonOutput = buildJsonOutput(comparisonRows, allResults);
  const outPath = path.resolve(__dirname, '../compute-results.json');
  fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`  Results written to: ${outPath}`);
}

// Allow direct invocation
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Compute comparison crashed:', err);
    process.exit(1);
  });
