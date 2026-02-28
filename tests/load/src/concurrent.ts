/**
 * Scenario 2: Concurrent Throughput
 *
 * Submits 50 `send_message` calls simultaneously with pre-assigned nonces to
 * avoid collisions. All transactions are fired at once via Promise.allSettled,
 * and we measure the elapsed time from first submission to all confirmed.
 *
 * Nonce Management Approach:
 *   1. Read the current nonce from the chain for the sender account.
 *   2. Pre-assign nonces [current, current+1, ..., current+49].
 *   3. Each transaction is submitted with its pre-assigned nonce.
 *   4. If any nonce collision or gap occurs, it is logged as a failure.
 *
 * PRD-003 target: >= 20 TPS
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
import { encodeFunctionData } from 'viem';

const TX_COUNT = 50;
const MESSAGE_SIZE_BYTES = 64;

export async function runConcurrent(): Promise<LoadTestResult> {
  console.log(
    '\n[Concurrent] Starting — 50 TXs fired simultaneously with pre-assigned nonces',
  );

  const { publicClient, walletClient, account } = createClients();
  const contractAddress = getContractAddress();

  // Step 1: Get current nonce
  const baseNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  console.log(`  [Concurrent] Base nonce: ${baseNonce}`);

  // Step 2: Prepare all messages
  const messages = Array.from({ length: TX_COUNT }, () =>
    generateMessage(MESSAGE_SIZE_BYTES),
  );

  // Step 3: Fire all transactions simultaneously
  const overallStart = performance.now();

  const txPromises = messages.map(async (message, i) => {
    const nonce = baseNonce + i;
    const txStart = performance.now();

    try {
      // Submit with explicit nonce to avoid collisions
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: SEND_MESSAGE_ABI,
        functionName: 'sendMessage',
        args: [message],
        nonce,
      });

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const txEnd = performance.now();

      return {
        success: true as const,
        latencyMs: txEnd - txStart,
        gasUsed: receipt.gasUsed,
        nonce,
      };
    } catch (err) {
      const txEnd = performance.now();
      const errMsg = err instanceof Error ? err.message : String(err);
      const isNonceError =
        errMsg.toLowerCase().includes('nonce') ||
        errMsg.toLowerCase().includes('replacement');

      return {
        success: false as const,
        latencyMs: txEnd - txStart,
        gasUsed: 0n,
        nonce,
        error: errMsg,
        isNonceError,
      };
    }
  });

  const results = await Promise.allSettled(txPromises);
  const overallEnd = performance.now();
  const elapsedMs = overallEnd - overallStart;

  // Step 4: Collect results
  const latencies: number[] = [];
  const gasUsed: bigint[] = [];
  let nonceErrors = 0;
  let otherErrors = 0;

  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const r = settled.value;
      if (r.success) {
        latencies.push(r.latencyMs);
        if (r.gasUsed > 0n) {
          gasUsed.push(r.gasUsed);
        }
      } else {
        if (r.isNonceError) {
          nonceErrors++;
        } else {
          otherErrors++;
        }
        console.warn(
          `  [Concurrent] TX nonce=${r.nonce} failed: ${r.error?.substring(0, 120)}`,
        );
      }
    } else {
      otherErrors++;
      console.warn(
        `  [Concurrent] Promise rejected: ${settled.reason}`,
      );
    }
  }

  const result = buildResult(
    'Scenario 2: Concurrent Throughput',
    TX_COUNT,
    latencies,
    elapsedMs,
    gasUsed,
    {
      nonceErrors,
      otherErrors,
      nonceManagement: 'Pre-assigned sequential nonces from pending nonce count',
    },
  );

  console.log(formatResult(result));

  // Nonce error summary
  if (nonceErrors > 0) {
    console.log(
      `  WARNING: ${nonceErrors} nonce-related failures detected.`,
    );
    console.log(
      `  This may indicate sequencer ordering issues or RPC nonce staleness.`,
    );
  }

  // Pass/fail check against PRD-003 target
  const target = 20;
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
  runConcurrent()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Concurrent test crashed:', err);
      process.exit(1);
    });
}
