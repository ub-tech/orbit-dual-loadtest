/**
 * Scenario 4: Message Size Impact
 *
 * Sends 25 transactions at each of four message sizes (32B, 256B, 1KB, 4KB)
 * to measure how gas cost and TPS scale with payload size.
 *
 * Analysis questions (from PRD-003):
 *   - Is gas scaling linear with message size?
 *   - Sublinear?
 *   - Stepwise?
 *
 * PRD-003 targets:
 *   - Gas per send_message (64B): < 100,000
 *   - Gas scaling (1KB vs 64B): < 3x
 */

import {
  createClients,
  getContractAddress,
  generateMessage,
  buildResult,
  formatResult,
  SEND_MESSAGE_ABI,
  type LoadTestResult,
} from './utils';

const TXS_PER_TIER = 25;

interface SizeTier {
  label: string;
  bytes: number;
}

const SIZE_TIERS: SizeTier[] = [
  { label: '32B', bytes: 32 },
  { label: '256B', bytes: 256 },
  { label: '1KB', bytes: 1024 },
  { label: '4KB', bytes: 4096 },
];

export async function runMessageSize(): Promise<LoadTestResult[]> {
  console.log(
    '\n[Message Size] Starting — 25 TXs per tier: 32B, 256B, 1KB, 4KB',
  );

  const { publicClient, walletClient, account } = createClients();
  const contractAddress = getContractAddress();

  const allResults: LoadTestResult[] = [];

  for (const tier of SIZE_TIERS) {
    console.log(`\n  [Message Size] Running tier: ${tier.label} (${tier.bytes} bytes)`);

    const latencies: number[] = [];
    const gasUsed: bigint[] = [];
    let failures = 0;

    const tierStart = performance.now();

    for (let i = 0; i < TXS_PER_TIER; i++) {
      const message = generateMessage(tier.bytes);
      const txStart = performance.now();

      try {
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: SEND_MESSAGE_ABI,
          functionName: 'sendMessage',
          args: [message],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const txEnd = performance.now();

        latencies.push(txEnd - txStart);
        if (receipt.gasUsed) {
          gasUsed.push(receipt.gasUsed);
        }
      } catch (err) {
        failures++;
        console.warn(
          `  [Message Size] ${tier.label} TX ${i + 1} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const tierEnd = performance.now();
    const elapsedMs = tierEnd - tierStart;

    const result = buildResult(
      `Scenario 4: Message Size — ${tier.label}`,
      TXS_PER_TIER,
      latencies,
      elapsedMs,
      gasUsed,
      { sizeBytes: tier.bytes, sizeLabel: tier.label },
    );

    allResults.push(result);
    console.log(formatResult(result));
  }

  // Gas scaling analysis
  console.log('\n  Gas Scaling Analysis:');
  console.log('  -----------------------------------------------');
  console.log('  Size   | Avg Gas     | Ratio vs 32B  | TPS');
  console.log('  -----------------------------------------------');

  const baseGas = allResults[0]?.avgGas;

  for (const r of allResults) {
    const sizeLabel = (r.extras?.sizeLabel as string) || '??';
    const avgGasStr = r.avgGas !== undefined ? r.avgGas.toString() : 'N/A';
    const ratio =
      r.avgGas !== undefined && baseGas !== undefined && baseGas > 0n
        ? `${(Number(r.avgGas) / Number(baseGas)).toFixed(2)}x`
        : 'N/A';
    console.log(
      `  ${sizeLabel.padEnd(6)} | ${avgGasStr.padStart(11)} | ${ratio.padStart(13)} | ${r.tps.toFixed(2)}`,
    );
  }
  console.log('  -----------------------------------------------');

  // Determine scaling pattern
  if (allResults.length >= 2 && baseGas !== undefined) {
    const gas1KB = allResults.find(
      (r) => (r.extras?.sizeBytes as number) === 1024,
    )?.avgGas;

    if (gas1KB !== undefined && baseGas > 0n) {
      const ratio1KBvs32B = Number(gas1KB) / Number(baseGas);

      // Check linearity: 1KB is 32x larger than 32B
      // Perfect linear scaling would give ratio = 32
      // < 32 means sublinear, > 32 means superlinear
      if (ratio1KBvs32B < 5) {
        console.log('  Scaling: SUBLINEAR — gas grows much slower than message size');
      } else if (ratio1KBvs32B < 15) {
        console.log('  Scaling: MODERATE — gas grows with size but sublinearly');
      } else if (ratio1KBvs32B < 35) {
        console.log('  Scaling: ROUGHLY LINEAR — gas scales proportionally with size');
      } else {
        console.log('  Scaling: SUPERLINEAR — gas grows faster than message size');
      }

      console.log(
        `\n  PRD-003 check: 1KB/32B gas ratio = ${ratio1KBvs32B.toFixed(
          2,
        )}x (target < 3x) | ${ratio1KBvs32B < 3 ? 'PASS' : 'FAIL'}`,
      );
    }
  }

  return allResults;
}

// Allow direct invocation
if (require.main === module) {
  runMessageSize()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Message size test crashed:', err);
      process.exit(1);
    });
}
