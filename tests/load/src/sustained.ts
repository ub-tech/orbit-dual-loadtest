/**
 * Scenario 3: Sustained Load
 *
 * Continuously submits `send_message` transactions for 60 seconds, as fast as
 * possible. Reports average TPS over the full window and per 10-second rolling
 * windows. Flags degradation if TPS drops >20% from the first window.
 *
 * PRD-003 targets:
 *   - Sustained TPS (60s avg): >= 8 TPS
 *   - TPS degradation over 60s: < 20% drop
 */

import {
  createClients,
  getContractAddress,
  generateMessage,
  buildResult,
  formatResult,
  SEND_MESSAGE_ABI,
  type LoadTestResult,
  type WindowStats,
} from './utils';

const DURATION_MS = 60_000; // 60 seconds
const WINDOW_MS = 10_000; // 10-second rolling windows
const MESSAGE_SIZE_BYTES = 64;

export async function runSustained(): Promise<LoadTestResult> {
  console.log(
    '\n[Sustained] Starting — continuous load for 60 seconds',
  );

  const { publicClient, walletClient, account } = createClients();
  const contractAddress = getContractAddress();

  const latencies: number[] = [];
  const gasUsed: bigint[] = [];
  const txTimestamps: number[] = []; // relative ms when each TX confirmed
  let failures = 0;

  const overallStart = performance.now();
  const deadline = overallStart + DURATION_MS;

  let txIndex = 0;

  // Submit transactions sequentially as fast as possible for 60 seconds
  while (performance.now() < deadline) {
    const message = generateMessage(MESSAGE_SIZE_BYTES);
    const txStart = performance.now();

    // Don't start a new TX if we're past the deadline
    if (txStart >= deadline) break;

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
      txTimestamps.push(txEnd - overallStart);

      if (receipt.gasUsed) {
        gasUsed.push(receipt.gasUsed);
      }

      txIndex++;

      // Progress indicator every 25 TXs
      if (txIndex % 25 === 0) {
        const elapsedSec = ((txEnd - overallStart) / 1000).toFixed(1);
        console.log(
          `  [Sustained] ${txIndex} TXs in ${elapsedSec}s (${(
            (txIndex / ((txEnd - overallStart) / 1000))
          ).toFixed(1)} TPS)`,
        );
      }
    } catch (err) {
      failures++;
      console.warn(
        `  [Sustained] TX ${txIndex + 1} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      txIndex++;
    }
  }

  const overallEnd = performance.now();
  const elapsedMs = overallEnd - overallStart;

  // Calculate 10-second window stats
  const windows: WindowStats[] = [];
  const windowCount = Math.ceil(DURATION_MS / WINDOW_MS);

  for (let w = 0; w < windowCount; w++) {
    const windowStartMs = w * WINDOW_MS;
    const windowEndMs = Math.min((w + 1) * WINDOW_MS, elapsedMs);

    // Count TXs confirmed within this window
    const windowTxCount = txTimestamps.filter(
      (ts) => ts >= windowStartMs && ts < windowEndMs,
    ).length;

    const windowDurationSec = (windowEndMs - windowStartMs) / 1000;
    const windowTps = windowDurationSec > 0 ? windowTxCount / windowDurationSec : 0;

    windows.push({
      windowIndex: w,
      startSec: windowStartMs / 1000,
      endSec: windowEndMs / 1000,
      txCount: windowTxCount,
      tps: windowTps,
    });
  }

  // Degradation analysis
  const firstWindowTps = windows.length > 0 ? windows[0].tps : 0;
  const lastWindowTps = windows.length > 0 ? windows[windows.length - 1].tps : 0;
  const degradationPct =
    firstWindowTps > 0
      ? ((firstWindowTps - lastWindowTps) / firstWindowTps) * 100
      : 0;
  const degraded = degradationPct > 20;

  const totalTxs = latencies.length + failures;

  const result = buildResult(
    'Scenario 3: Sustained Load (60s)',
    totalTxs,
    latencies,
    elapsedMs,
    gasUsed,
    {
      windows: windows.map((w) => ({
        window: `${w.startSec.toFixed(0)}-${w.endSec.toFixed(0)}s`,
        txCount: w.txCount,
        tps: Number(w.tps.toFixed(2)),
      })),
      degradationPct: Number(degradationPct.toFixed(2)),
      degraded,
    },
  );

  console.log(formatResult(result));

  // Print window breakdown
  console.log('  Rolling Window Breakdown:');
  console.log('  -----------------------------------------------');
  console.log('  Window          | TXs  | TPS');
  console.log('  -----------------------------------------------');
  for (const w of windows) {
    const marker =
      w.windowIndex === 0
        ? ' (baseline)'
        : w.tps < firstWindowTps * 0.8
        ? ' (DEGRADED)'
        : '';
    console.log(
      `  ${w.startSec.toFixed(0).padStart(3)}s - ${w.endSec
        .toFixed(0)
        .padStart(3)}s  | ${String(w.txCount).padStart(4)} | ${w.tps.toFixed(
        2,
      )}${marker}`,
    );
  }
  console.log('  -----------------------------------------------');
  console.log(
    `  Degradation: ${degradationPct.toFixed(1)}% ${
      degraded ? '(EXCEEDS 20% THRESHOLD)' : '(within threshold)'
    }`,
  );

  // Pass/fail checks
  const tpsTarget = 8;
  const tpsPass = result.tps >= tpsTarget;
  const degradePass = !degraded;

  console.log(
    `\n  TPS Target     : >= ${tpsTarget} TPS | Actual: ${result.tps.toFixed(
      2,
    )} TPS | ${tpsPass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  Degradation    : < 20% drop | Actual: ${degradationPct.toFixed(
      1,
    )}% | ${degradePass ? 'PASS' : 'FAIL'}`,
  );

  return result;
}

// Allow direct invocation
if (require.main === module) {
  runSustained()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sustained test crashed:', err);
      process.exit(1);
    });
}
