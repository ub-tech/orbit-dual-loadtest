/**
 * Load Test Orchestrator
 *
 * Runs all four load test scenarios sequentially, collects results, prints a
 * combined summary table, and writes results to tests/load/results.json.
 *
 * Scenarios:
 *   1. Sequential Throughput (100 TXs, one at a time)
 *   2. Concurrent Throughput (50 TXs, simultaneous)
 *   3. Sustained Load (60 seconds continuous)
 *   4. Message Size Impact (32B, 256B, 1KB, 4KB)
 */

import * as fs from 'fs';
import * as path from 'path';
import { type LoadTestResult, resultToJson } from './utils';
import { runSequential } from './sequential';
import { runConcurrent } from './concurrent';
import { runSustained } from './sustained';
import { runMessageSize } from './message-size';

// PRD-003 TPS targets
const TARGETS: Record<string, number> = {
  sequential: 10,
  concurrent: 20,
  sustained: 8,
};

interface SummaryRow {
  scenario: string;
  tps: string;
  avgLatency: string;
  avgGas: string;
  pass: string;
}

function passOrFail(result: LoadTestResult, target: number | null): string {
  if (target === null) return '-';
  return result.tps >= target ? 'PASS' : 'FAIL';
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Omega Messaging — TPS Load Test Suite (PRD-003)');
  console.log('='.repeat(60));
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log(`  Contract:   ${process.env.MESSAGING_CONTRACT_ADDRESS || '(from file)'}`);
  console.log(`  RPC:        ${process.env.L2_CHAIN_RPC || 'http://localhost:8547'}`);
  console.log('');

  const allResults: LoadTestResult[] = [];
  const errors: { scenario: string; error: string }[] = [];

  // -------------------------------------------------------------------------
  // Scenario 1: Sequential
  // -------------------------------------------------------------------------
  try {
    const seqResult = await runSequential();
    allResults.push(seqResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: Sequential test failed — ${msg}`);
    errors.push({ scenario: 'Sequential', error: msg });
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Concurrent
  // -------------------------------------------------------------------------
  try {
    const concResult = await runConcurrent();
    allResults.push(concResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: Concurrent test failed — ${msg}`);
    errors.push({ scenario: 'Concurrent', error: msg });
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Sustained
  // -------------------------------------------------------------------------
  try {
    const susResult = await runSustained();
    allResults.push(susResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: Sustained test failed — ${msg}`);
    errors.push({ scenario: 'Sustained', error: msg });
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Message Size
  // -------------------------------------------------------------------------
  let msgSizeResults: LoadTestResult[] = [];
  try {
    msgSizeResults = await runMessageSize();
    allResults.push(...msgSizeResults);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: Message size test failed — ${msg}`);
    errors.push({ scenario: 'Message Size', error: msg });
  }

  // -------------------------------------------------------------------------
  // Summary Table
  // -------------------------------------------------------------------------
  console.log('\n');
  console.log('='.repeat(72));
  console.log('  COMBINED RESULTS SUMMARY');
  console.log('='.repeat(72));

  const rows: SummaryRow[] = [];

  // Find core scenario results
  const seqResult = allResults.find((r) =>
    r.scenario.includes('Sequential'),
  );
  const concResult = allResults.find((r) =>
    r.scenario.includes('Concurrent'),
  );
  const susResult = allResults.find((r) =>
    r.scenario.includes('Sustained'),
  );

  if (seqResult) {
    rows.push({
      scenario: 'Sequential',
      tps: seqResult.tps.toFixed(2),
      avgLatency: `${seqResult.avgLatencyMs.toFixed(0)}ms`,
      avgGas: seqResult.avgGas?.toString() ?? 'N/A',
      pass: passOrFail(seqResult, TARGETS.sequential),
    });
  }

  if (concResult) {
    rows.push({
      scenario: 'Concurrent',
      tps: concResult.tps.toFixed(2),
      avgLatency: `${concResult.avgLatencyMs.toFixed(0)}ms`,
      avgGas: concResult.avgGas?.toString() ?? 'N/A',
      pass: passOrFail(concResult, TARGETS.concurrent),
    });
  }

  if (susResult) {
    rows.push({
      scenario: 'Sustained',
      tps: susResult.tps.toFixed(2),
      avgLatency: `${susResult.avgLatencyMs.toFixed(0)}ms`,
      avgGas: susResult.avgGas?.toString() ?? 'N/A',
      pass: passOrFail(susResult, TARGETS.sustained),
    });
  }

  for (const msResult of msgSizeResults) {
    const label = (msResult.extras?.sizeLabel as string) || 'unknown';
    rows.push({
      scenario: `Msg Size ${label}`,
      tps: msResult.tps.toFixed(2),
      avgLatency: `${msResult.avgLatencyMs.toFixed(0)}ms`,
      avgGas: msResult.avgGas?.toString() ?? 'N/A',
      pass: '-',
    });
  }

  // Print markdown-style table
  const hdr = '| Scenario       | TPS    | Avg Latency | Avg Gas      | Pass? |';
  const sep = '|----------------|--------|-------------|--------------|-------|';
  console.log(`  ${hdr}`);
  console.log(`  ${sep}`);

  for (const row of rows) {
    console.log(
      `  | ${row.scenario.padEnd(14)} | ${row.tps.padStart(6)} | ${row.avgLatency.padStart(11)} | ${row.avgGas.padStart(12)} | ${row.pass.padStart(5)} |`,
    );
  }

  // Print errors if any
  if (errors.length > 0) {
    console.log('\n  ERRORS:');
    for (const e of errors) {
      console.log(`    - ${e.scenario}: ${e.error}`);
    }
  }

  // Overall verdict
  const coreTests = [seqResult, concResult, susResult].filter(
    Boolean,
  ) as LoadTestResult[];
  const allPassed =
    coreTests.length === 3 &&
    (seqResult?.tps ?? 0) >= TARGETS.sequential &&
    (concResult?.tps ?? 0) >= TARGETS.concurrent &&
    (susResult?.tps ?? 0) >= TARGETS.sustained;

  console.log('\n' + '='.repeat(72));
  console.log(
    `  OVERALL: ${allPassed ? 'PASS' : 'FAIL'} (${coreTests.length}/3 core scenarios ran)`,
  );
  console.log('='.repeat(72));
  console.log(`  Finished at: ${new Date().toISOString()}`);
  console.log('');

  // -------------------------------------------------------------------------
  // Write results.json
  // -------------------------------------------------------------------------
  const outputPath = path.resolve(__dirname, '../results.json');
  const output = {
    timestamp: new Date().toISOString(),
    rpc: process.env.L2_CHAIN_RPC || 'http://localhost:8547',
    contractAddress: process.env.MESSAGING_CONTRACT_ADDRESS || '(from file)',
    overallPass: allPassed,
    results: allResults.map(resultToJson),
    errors,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  Results written to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Load test suite crashed:', err);
  process.exit(1);
});
