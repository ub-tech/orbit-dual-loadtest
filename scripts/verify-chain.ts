/**
 * verify-chain.ts
 *
 * Post-deployment verification for the Omega Messaging Chain.
 * Reads core contract addresses from chain-config/coreContracts.json,
 * connects to the L2 RPC endpoint, and verifies chain health.
 *
 * Usage:
 *   npx ts-node scripts/verify-chain.ts
 *
 * Environment variables (loaded from .env):
 *   L2_CHAIN_RPC  - L2 chain RPC URL (default: http://localhost:8547)
 *   CHAIN_ID      - Expected chain ID (default: 97400766)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http } from 'viem';

// ---------------------------------------------------------------------------
// Load environment
// ---------------------------------------------------------------------------
dotenv.config();

const L2_RPC = process.env.L2_CHAIN_RPC || 'http://localhost:8449';
const EXPECTED_CHAIN_ID = Number(process.env.CHAIN_ID) || 97400766;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface VerificationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

function printResult(result: VerificationResult): void {
  const icon =
    result.status === 'PASS' ? '[PASS]' : result.status === 'FAIL' ? '[FAIL]' : '[WARN]';
  console.log(`  ${icon} ${result.check}`);
  if (result.detail) {
    console.log(`         ${result.detail}`);
  }
}

// ---------------------------------------------------------------------------
// Verification checks
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  Omega Messaging Chain — Verification Script');
  console.log('='.repeat(70));
  console.log();

  const results: VerificationResult[] = [];

  // -----------------------------------------------------------------------
  // Check 1: Core contracts file exists
  // -----------------------------------------------------------------------
  const coreContractsPath = path.resolve(__dirname, '..', 'chain-config', 'coreContracts.json');
  if (fs.existsSync(coreContractsPath)) {
    const raw = fs.readFileSync(coreContractsPath, 'utf-8');
    let contracts: Record<string, string>;
    try {
      contracts = JSON.parse(raw);
      const contractCount = Object.keys(contracts).length;
      results.push({
        check: 'Core contracts file exists and is valid JSON',
        status: 'PASS',
        detail: `${contractCount} contract address(es) found in ${coreContractsPath}`,
      });

      // Log the contracts
      console.log('Core Contracts:');
      for (const [name, address] of Object.entries(contracts)) {
        console.log(`  ${name.padEnd(24)} : ${address}`);
      }
      console.log();
    } catch {
      results.push({
        check: 'Core contracts file is valid JSON',
        status: 'FAIL',
        detail: `Failed to parse ${coreContractsPath}`,
      });
    }
  } else {
    results.push({
      check: 'Core contracts file exists',
      status: 'FAIL',
      detail: `File not found: ${coreContractsPath}. Run deploy-chain.ts first.`,
    });
  }

  // -----------------------------------------------------------------------
  // Check 2: Node config file exists
  // -----------------------------------------------------------------------
  const nodeConfigPath = path.resolve(__dirname, '..', 'chain-config', 'nodeConfig.json');
  if (fs.existsSync(nodeConfigPath)) {
    results.push({
      check: 'Node config file exists',
      status: 'PASS',
      detail: nodeConfigPath,
    });
  } else {
    results.push({
      check: 'Node config file exists',
      status: 'WARN',
      detail: `File not found: ${nodeConfigPath}. Run deploy-chain.ts first.`,
    });
  }

  // -----------------------------------------------------------------------
  // Check 3: L2 RPC is reachable
  // -----------------------------------------------------------------------
  console.log(`Connecting to L2 RPC at ${L2_RPC}...`);
  console.log();

  const l2Client = createPublicClient({
    transport: http(L2_RPC),
  });

  let l2Reachable = false;
  let actualChainId: number | undefined;

  try {
    actualChainId = await l2Client.getChainId();
    l2Reachable = true;
    results.push({
      check: 'L2 RPC is reachable',
      status: 'PASS',
      detail: `Connected to ${L2_RPC}`,
    });
  } catch (err) {
    results.push({
      check: 'L2 RPC is reachable',
      status: 'FAIL',
      detail: `Cannot connect to ${L2_RPC}. Is the Arbitrum node running?`,
    });
  }

  // -----------------------------------------------------------------------
  // Check 4: Chain ID matches expected value
  // -----------------------------------------------------------------------
  if (l2Reachable && actualChainId !== undefined) {
    if (actualChainId === EXPECTED_CHAIN_ID) {
      results.push({
        check: 'Chain ID matches expected value',
        status: 'PASS',
        detail: `Chain ID: ${actualChainId} (expected: ${EXPECTED_CHAIN_ID})`,
      });
    } else {
      results.push({
        check: 'Chain ID matches expected value',
        status: 'FAIL',
        detail: `Chain ID: ${actualChainId} (expected: ${EXPECTED_CHAIN_ID})`,
      });
    }
  } else if (!l2Reachable) {
    results.push({
      check: 'Chain ID matches expected value',
      status: 'FAIL',
      detail: 'Skipped — L2 RPC is not reachable.',
    });
  }

  // -----------------------------------------------------------------------
  // Check 5: Block number is incrementing
  // -----------------------------------------------------------------------
  if (l2Reachable) {
    try {
      const blockNumber1 = await l2Client.getBlockNumber();
      console.log(`  Current block number: ${blockNumber1}`);

      // Wait 2 seconds and check again
      console.log('  Waiting 2 seconds to check block production...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const blockNumber2 = await l2Client.getBlockNumber();
      console.log(`  Block number after wait: ${blockNumber2}`);
      console.log();

      if (blockNumber2 > blockNumber1) {
        results.push({
          check: 'Blocks are being produced',
          status: 'PASS',
          detail: `Block number advanced from ${blockNumber1} to ${blockNumber2}`,
        });
      } else {
        results.push({
          check: 'Blocks are being produced',
          status: 'WARN',
          detail: `Block number did not advance (${blockNumber1} -> ${blockNumber2}). ` +
            'The sequencer produces blocks on-demand — send a transaction to trigger block production.',
        });
      }
    } catch (err) {
      results.push({
        check: 'Blocks are being produced',
        status: 'FAIL',
        detail: `Failed to query block number: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    results.push({
      check: 'Blocks are being produced',
      status: 'FAIL',
      detail: 'Skipped — L2 RPC is not reachable.',
    });
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('='.repeat(70));
  console.log('  Verification Results');
  console.log('='.repeat(70));
  console.log();

  for (const result of results) {
    printResult(result);
    console.log();
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;

  console.log('-'.repeat(70));
  console.log(`  Total: ${results.length} checks — ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('-'.repeat(70));
  console.log();

  if (failCount > 0) {
    console.log('Chain verification FAILED. Review the errors above.');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('Chain verification PASSED with warnings.');
  } else {
    console.log('Chain verification PASSED. All checks green.');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error('\nUnhandled error during verification:');
  console.error(err);
  process.exit(1);
});
