# PRD-003: TPS Load Testing

**Status:** Approved
**Date:** 2026-02-27
**Author:** EM (CLAUDE.md Orchestrator)
**Depends On:** PRD-001 (running chain), PRD-002 (deployed contract)

## Purpose

Measure the transactions-per-second (TPS) throughput of the Stylus messaging contract under realistic load conditions. Establish performance baselines and identify bottlenecks for the Arbitrum L2 chain.

## Goals

1. **Measure sequential TPS** — baseline throughput with single-threaded transaction submission
2. **Measure concurrent TPS** — throughput under parallel submission with nonce management
3. **Measure sustained TPS** — throughput stability over a 60-second continuous load window
4. **Characterize gas costs** — gas consumption by message size and operation type
5. **Compare WASM vs EVM** — estimate Stylus performance advantage over equivalent Solidity
6. **Identify bottlenecks** — sequencer, gas limits, nonce management, I/O overhead

## Test Scenarios

### Scenario 1: Sequential Throughput
- **Method:** 100 `send_message` calls, submitted one at a time, each waiting for confirmation
- **Metric:** Wall-clock TPS = `100 / elapsed_seconds`
- **Message:** Fixed 64-byte payload

### Scenario 2: Concurrent Throughput
- **Method:** 50 `send_message` calls submitted simultaneously with pre-assigned nonces
- **Metric:** Effective TPS = `50 / time_to_all_confirmed`
- **Constraint:** Nonce management is a known challenge; document workaround and any collisions

### Scenario 3: Sustained Load
- **Method:** Continuous `send_message` submission for 60 seconds
- **Metric:** Average TPS across full window; rolling TPS in 10-second windows
- **Observation:** Does TPS degrade over time? If so, identify cause.

### Scenario 4: Message Size Impact
- **Method:** Send messages at 32B, 256B, 1KB, and 4KB sizes (25 TXs per tier)
- **Metric:** Gas cost per tier, TPS per tier
- **Analysis:** Is gas scaling linear with size? Sublinear? Stepwise?

### Scenario 5: Stylus vs EVM Comparison
- **Method:** Use gas measurements from Scenario 1 and Scenario 4; compare against documented Solidity gas costs for equivalent storage operations
- **Metric:** Stylus discount percentage
- **Note:** Exact comparison requires a Solidity equivalent contract; this scenario produces an estimate

## Success Criteria

| Metric | Target | Concern Threshold |
|---|---|---|
| Sequential TPS | >= 10 TPS | < 5 TPS |
| Concurrent TPS | >= 20 TPS | < 10 TPS |
| Sustained TPS (60s avg) | >= 8 TPS | < 4 TPS |
| TPS degradation over 60s | < 20% drop | > 50% drop |
| Gas per `send_message` (64B) | < 100,000 | > 250,000 |
| Gas scaling (1KB vs 64B) | < 3x | > 5x |
| Stylus vs EVM discount | >= 30% | < 10% |

## Bottleneck Analysis Requirements

The load test report must address each of the following:

1. **Sequencer throughput** — Is the sequencer the limiting factor? What is its theoretical max TPS?
2. **Block gas limit** — Are transactions queuing because blocks fill up? What is the block gas limit?
3. **Nonce management** — In concurrent scenarios, do nonce gaps or collisions cause delays or failures?
4. **I/O overhead** — What fraction of total latency is RPC round-trip vs on-chain execution?
5. **Storage growth** — Does gas cost increase as the contract stores more messages?

## Output

The `load-tester` agent produces a test report at `docs/testing/reports/load-tester-<date>.md` following the format in `docs/testing/reporting-results-spec.md`, with:
- Finding ID prefix: `LOAD-`
- TPS summary table per scenario
- Latency distribution (min/p50/p90/p99/max)
- Gas analysis by message size
- Bottleneck analysis
- Pass/fail against targets above

## Scope

### In Scope
- `send_message` throughput and latency
- Gas cost profiling by message size
- Nonce management for concurrent submission
- Sequencer and block gas limit analysis

### Out of Scope
- Bridge throughput (L2→L1 is bottlenecked by challenge period, not TPS)
- `get_message` read throughput (reads are free, no gas contention)
- Multi-node cluster load testing
- Mainnet benchmarking
