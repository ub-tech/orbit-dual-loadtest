/**
 * Scenario 1: Sequential Throughput
 *
 * Submits 100 `send_message` calls one at a time, each waiting for on-chain
 * confirmation before submitting the next. Measures wall-clock TPS, per-TX
 * latency distribution, and gas consumption.
 *
 * PRD-003 target: >= 10 TPS
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

const TX_COUNT = 100;
const MESSAGE_SIZE_BYTES = 64;

export async function runSequential(): Promise<LoadTestResult> {
  console.log('\n[Sequential] Starting — 100 TXs, 64-byte messages, one at a time');

  const { publicClient, walletClient, account } = createClients();
  const contractAddress = getContractAddress();

  const latencies: number[] = [];
  const gasUsed: bigint[] = [];
  let failures = 0;

  const overallStart = performance.now();

  for (let i = 0; i < TX_COUNT; i++) {
    const message = generateMessage(MESSAGE_SIZE_BYTES);
    const txStart = performance.now();

    try {
      // Submit the transaction
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: SEND_MESSAGE_ABI,
        functionName: 'sendMessage',
        args: [message],
      });

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const txEnd = performance.now();
      latencies.push(txEnd - txStart);

      if (receipt.gasUsed) {
        gasUsed.push(receipt.gasUsed);
      }

      // Progress indicator every 10 TXs
      if ((i + 1) % 10 === 0) {
        console.log(`  [Sequential] ${i + 1}/${TX_COUNT} complete`);
      }
    } catch (err) {
      failures++;
      const txEnd = performance.now();
      console.warn(
        `  [Sequential] TX ${i + 1} failed after ${(txEnd - txStart).toFixed(0)}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const overallEnd = performance.now();
  const elapsedMs = overallEnd - overallStart;

  const result = buildResult(
    'Scenario 1: Sequential Throughput',
    TX_COUNT,
    latencies,
    elapsedMs,
    gasUsed,
  );

  console.log(formatResult(result));

  // Pass/fail check against PRD-003 target
  const target = 10;
  const pass = result.tps >= target;
  console.log(
    `  Target: >= ${target} TPS | Actual: ${result.tps.toFixed(2)} TPS | ${
      pass ? 'PASS' : 'FAIL'
    }`,
  );

  return result;
}

// Allow direct invocation
if (require.main === module) {
  runSequential()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sequential test crashed:', err);
      process.exit(1);
    });
}
