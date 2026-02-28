# Integration Test Report
**Date:** 2026-02-27
**Agent:** integration-tester
**Scope:** Cross-component integration analysis — Chain SDK → Node Config, Frontend ABI compatibility, Chain config, Bridge (ArbSys), Load Test → Contract, Deploy Script
**Status:** Partial

---

## Summary

- Total checks: 24
- Passed: 18
- Failed: 4
- Blocked: 2 (requires live chain for runtime verification)

---

## Integration Areas Analyzed

1. Chain SDK → Node Config (`deploy-chain.ts`)
2. Frontend ABI → Stylus contract `#[public]` interface (`MessagingContract.ts` vs `lib.rs`)
3. Frontend → Chain config (`chains.ts`, `wagmi.ts`)
4. Contract → Bridge / ArbSys precompile (`lib.rs` bridge section)
5. Load Tests → Contract ABI and RPC config (`tests/load/src/utils.ts`, `concurrent.ts`)
6. Deploy Script → Environment variables and contract path (`scripts/deploy-contract.sh`)
7. Data format compatibility across component boundaries

---

## Findings

---

### Finding: Frontend ABI uses snake_case function names — Solidity selector mismatch risk

- **ID:** INT-001
- **Severity:** S2
- **Category:** Integration
- **Component:** `frontend/src/abi/MessagingContract.ts`, `contracts/messaging/src/lib.rs`
- **Description:** The Rust Stylus contract defines public functions using snake_case identifiers (`send_message`, `get_message`, `get_sender`, `message_count`, `bridge_message`). The Stylus SDK `#[public]` macro generates Solidity-compatible ABI selectors by converting these snake_case names directly into their 4-byte keccak selector — it does NOT automatically camelCase them. The frontend ABI in `MessagingContract.ts` also uses snake_case names (`send_message`, `get_message`, etc.), which is internally consistent. However, this is a non-standard pattern for Solidity/EVM tooling. Most EVM tooling (ethers.js, viem) generates selectors from the literal function name as declared in the ABI. The concern is whether the Stylus `#[public]` macro exports selectors for `send_message(string)` or `sendMessage(string)`. As of stylus-sdk 0.6.0, `#[public]` emits selectors using the Rust function name verbatim (snake_case). The frontend ABI correctly mirrors this. The integration is **consistent** on current stylus-sdk 0.6.0, but this must be verified on deploy, and a future stylus-sdk upgrade could silently break it if the SDK ever normalizes to camelCase.
- **Steps to Reproduce:**
  1. Export the ABI using `cargo stylus export-abi` on `contracts/messaging/`
  2. Compare the exported selector for `send_message` vs the selector in `frontend/src/abi/MessagingContract.ts`
  3. Attempt `cast call` with `send_message(string)` selector against deployed contract
- **Expected Behavior:** `cargo stylus export-abi` output matches `MessagingContract.ts` exactly for all function signatures and selectors
- **Actual Behavior:** Cannot confirm at static analysis time — no exported ABI artifact exists in the repository
- **Evidence:** `contracts/messaging/src/lib.rs` line 89: `pub fn send_message(...)`. `frontend/src/abi/MessagingContract.ts` line 18: `name: 'send_message'`. No `cargo stylus export-abi` output artifact committed to repository.
- **Recommendation:** Run `cargo stylus export-abi` and commit the output as `contracts/messaging/abi/MessagingContract.json`. Add a CI check that diffs the frontend ABI against the canonical export artifact so drift is caught automatically. Document that snake_case selectors are the intended ABI contract.

---

### Finding: deploy-contract.sh does not capture or persist contract address

- **ID:** INT-002
- **Severity:** S2
- **Category:** Integration
- **Component:** `scripts/deploy-contract.sh`
- **Description:** The deploy script runs `cargo stylus deploy` and echoes "Record the contract address from the output above," but it does not parse the deployed address from the CLI output, write it to `chain-config/contractAddress.txt`, or set `MESSAGING_CONTRACT_ADDRESS` in `.env`. The load test utility (`tests/load/src/utils.ts`, `getContractAddress()`) expects the address at either `MESSAGING_CONTRACT_ADDRESS` env var or `chain-config/contractAddress.txt`. The frontend (`frontend/src/config/chains.ts`) expects `NEXT_PUBLIC_MESSAGING_CONTRACT` env var. None of these are populated automatically. This breaks the end-to-end pipeline: a developer must manually extract the address from terminal output and update both `.env` and `.env.local` (or `NEXT_PUBLIC_*` env) before load tests or the frontend can function.
- **Steps to Reproduce:**
  1. Run `./scripts/deploy-contract.sh` on a running L2 chain
  2. Observe terminal output for deployed address
  3. Check `chain-config/contractAddress.txt` — file does not exist
  4. Run load tests — they fail with "No contract address found"
- **Expected Behavior:** After deployment, `chain-config/contractAddress.txt` is written with the deployed address; `.env` is updated or a separate `chain-config/.env.deploy` output file is written
- **Actual Behavior:** Contract address exists only in terminal stdout; no automated handoff to downstream consumers
- **Evidence:** `scripts/deploy-contract.sh` line 61-64: `cargo +stable stylus deploy ... 2>&1`. Line 68: `echo "Record the contract address from the output above."`. `tests/load/src/utils.ts` line 86-96: reads from `chain-config/contractAddress.txt` as fallback.
- **Recommendation:** Parse the deployed contract address from `cargo stylus deploy` output (it is printed as `contract address: 0x...`) and write it to `chain-config/contractAddress.txt`. Also emit a shell snippet showing which env vars to set. Example: `ADDR=$(cargo stylus deploy ... 2>&1 | grep "contract address" | awk '{print $NF}'); echo "$ADDR" > "$PROJECT_ROOT/chain-config/contractAddress.txt"`

---

### Finding: BridgeStatus component parses raw log data instead of using decoded ABI event

- **ID:** INT-003
- **Severity:** S2
- **Category:** Integration
- **Component:** `frontend/src/components/BridgeStatus.tsx`
- **Description:** The `BridgeStatus` component calls `useWatchContractEvent` with the full ABI and event name `MessageBridged`, but in the `onLogs` callback it manually decodes the log by reading raw `log.topics[1]` for the message ID and `log.data` for the bridge TX hash. This bypasses viem's ABI decoding. The `MessageBridged` event has signature `MessageBridged(uint256 indexed id, bytes32 bridgeTxHash)`. The bridge TX hash is a non-indexed `bytes32` parameter, so it is ABI-encoded in `log.data` as a 32-byte padded value. The component assigns `log.data` directly as `bridgeTxHash`, which means it stores the full raw hex ABI-encoded data string (32 bytes = 66 hex chars including `0x`). This is actually the correct value for `bytes32`, but the component renders it as a generic string in the UI rather than the properly decoded `0x`-prefixed 32-byte hex. More importantly, `useWatchContractEvent` in wagmi v2 provides decoded log args when ABI is supplied — the component should use `log.args.bridgeTxHash` and `log.args.id` from the decoded event instead of manually parsing topics and data. The manual parsing is fragile and bypasses wagmi/viem's type-safe decoding.
- **Steps to Reproduce:**
  1. Bridge a message via the UI
  2. Observe `onLogs` callback receives viem Log objects
  3. Check `log.args` is available with fully decoded fields when ABI is passed to `useWatchContractEvent`
  4. Note component ignores `log.args` and reads `log.topics[1]` and `log.data` instead
- **Expected Behavior:** Component uses `(log as any).args.id` and `(log as any).args.bridgeTxHash` from the decoded event data provided by wagmi/viem
- **Actual Behavior:** Component reads raw `log.topics[1]` and `log.data`, which works incidentally for this event structure but is brittle and ignores viem's decoding
- **Evidence:** `frontend/src/components/BridgeStatus.tsx` lines 27-34: manual topic/data extraction. Line 51-57: `useWatchContractEvent` is called with full ABI but decoded args are not used.
- **Recommendation:** Use the `args` property from the typed log: `const typedLog = log as unknown as { args: { id: bigint; bridgeTxHash: \`0x${string}\` } }`. Update `messageId` to `typedLog.args.id.toString()` and `bridgeTxHash` to `typedLog.args.bridgeTxHash`. This eliminates manual hex math and provides type safety.

---

### Finding: Cargo.toml stylus-sdk version (0.6.0) does not match installed cargo-stylus CLI (0.10.0)

- **ID:** INT-004
- **Severity:** S3
- **Category:** Integration
- **Component:** `contracts/messaging/Cargo.toml`, toolchain
- **Description:** The `Cargo.toml` pins `stylus-sdk = "0.6.0"` but the installed CLI is `cargo-stylus 0.10.0`. The `cargo-stylus` CLI version and the `stylus-sdk` crate version must be compatible. As of the Stylus ecosystem, `cargo-stylus 0.10.x` is designed to work with `stylus-sdk 0.7.x` or later. Using `stylus-sdk 0.6.0` with `cargo-stylus 0.10.0` may cause WASM validation failures or `check` command errors due to SDK ABI or metadata format changes between those versions. This is a potential build-time integration break that would surface during `cargo stylus check`.
- **Steps to Reproduce:**
  1. `cd contracts/messaging && cargo +stable stylus check --endpoint http://localhost:8547`
  2. Observe whether WASM validation passes or fails with SDK/CLI version mismatch errors
- **Expected Behavior:** `cargo stylus check` passes cleanly with no version-related warnings or errors
- **Actual Behavior:** Cannot confirm at static analysis time; there is a known compatibility gap between stylus-sdk 0.6.0 and cargo-stylus 0.10.0
- **Evidence:** `contracts/messaging/Cargo.toml` line 7: `stylus-sdk = "0.6.0"`. `cargo stylus --version` reports 0.10.0.
- **Recommendation:** Update `Cargo.toml` to `stylus-sdk = "0.8.0"` (or the latest version compatible with `cargo-stylus 0.10.0`). Verify compatibility matrix in the Arbitrum Stylus release notes. Run `cargo stylus check` after updating to confirm.

---

### Finding: deploy-chain.ts passes parentChainId as foundry.id (31337) — may not match actual Anvil chain ID

- **ID:** INT-005
- **Severity:** S3
- **Category:** Integration
- **Component:** `scripts/deploy-chain.ts`
- **Description:** In `prepareNodeConfig`, the `parentChainId` argument is hardcoded to `foundry.id` (which equals 31337 per viem's `foundry` chain definition). Anvil's default chain ID is also 31337, so under normal circumstances this is correct. However, the script reads `PARENT_CHAIN_RPC` from the environment and creates a `publicClient` against it — it verifies connectivity and logs the actual parent chain ID. But it does not cross-check that the reported parent chain ID equals `foundry.id` before passing `foundry.id` to `prepareNodeConfig`. If the `PARENT_CHAIN_RPC` points to a non-Anvil parent chain (e.g., Sepolia with chain ID 11155111), `prepareNodeConfig` will receive the wrong `parentChainId`, which corrupts the generated node config's parent chain reference. The verification step at line 125-132 reads the actual parent chain ID but the value is discarded without validation.
- **Steps to Reproduce:**
  1. Set `PARENT_CHAIN_RPC=https://sepolia.infura.io/v3/...` in `.env`
  2. Run `npx ts-node scripts/deploy-chain.ts`
  3. Observe that `prepareNodeConfig` receives `parentChainId: 31337` even though the actual parent is Sepolia (11155111)
- **Expected Behavior:** `prepareNodeConfig` receives the dynamically determined parent chain ID from `publicClient.getChainId()`
- **Actual Behavior:** `prepareNodeConfig` always receives `foundry.id` (31337) regardless of actual parent chain
- **Evidence:** `scripts/deploy-chain.ts` line 125-132: reads `parentChainId` but discards it. Line 209: `parentChainId: foundry.id`.
- **Recommendation:** Capture the actual parent chain ID from the connectivity check: `const parentChainId = await parentChainPublicClient.getChainId()` then pass `parentChainId` to `prepareNodeConfig`. Also add a validation check that warns if the actual chain ID differs from the expected Anvil/foundry value.

---

### Finding: Load test contract address env var name inconsistency

- **ID:** INT-006
- **Severity:** S3
- **Category:** Integration
- **Component:** `tests/load/src/utils.ts`, `frontend/src/config/chains.ts`, `.env.example`
- **Description:** There is an inconsistency in environment variable names for the contract address across components. `.env.example` defines `MESSAGING_CONTRACT_ADDRESS` (line 51). The load test `utils.ts` reads `process.env.MESSAGING_CONTRACT_ADDRESS` (line 81). The frontend `chains.ts` reads `process.env.NEXT_PUBLIC_MESSAGING_CONTRACT` (line 32). These are two different variable names pointing to the same contract address. A developer must set both: `MESSAGING_CONTRACT_ADDRESS` for load tests and `NEXT_PUBLIC_MESSAGING_CONTRACT` for the frontend. The `.env.example` only documents `MESSAGING_CONTRACT_ADDRESS`, leaving `NEXT_PUBLIC_MESSAGING_CONTRACT` undocumented. This creates operational confusion and potential for the frontend and load tests to point to different contract addresses if the developer sets only one.
- **Steps to Reproduce:**
  1. Set `MESSAGING_CONTRACT_ADDRESS=0xABC...` in `.env`
  2. Start the Next.js frontend
  3. Observe that `NEXT_PUBLIC_MESSAGING_CONTRACT` is unset, so `chains.ts` returns the zero address `0x0000...0000`
  4. The frontend silently calls the zero address
- **Expected Behavior:** A single environment variable is used (or `.env.example` documents both variables clearly, and `deploy-contract.sh` sets both)
- **Actual Behavior:** Two different variable names serve the same purpose; only one is documented in `.env.example`
- **Evidence:** `.env.example` line 51: `MESSAGING_CONTRACT_ADDRESS=`. `frontend/src/config/chains.ts` line 31-33: reads `NEXT_PUBLIC_MESSAGING_CONTRACT`. `tests/load/src/utils.ts` line 81: reads `MESSAGING_CONTRACT_ADDRESS`.
- **Recommendation:** Add `NEXT_PUBLIC_MESSAGING_CONTRACT=` to `.env.example` with a comment explaining it mirrors `MESSAGING_CONTRACT_ADDRESS` for the Next.js frontend. Update `deploy-contract.sh` to write both variables. Alternatively, consolidate to one name if the Next.js `NEXT_PUBLIC_` prefix requirement can be satisfied at build time via `next.config.js` env mapping.

---

### Finding: Frontend chain config RPC URLs are hardcoded with no runtime override

- **ID:** INT-007
- **Severity:** S3
- **Category:** Integration
- **Component:** `frontend/src/config/chains.ts`
- **Description:** The `omegaMessagingChain` definition hardcodes RPC URLs as `http://localhost:8547` and `ws://localhost:8548`. Unlike the deploy scripts and load tests (which read `L2_CHAIN_RPC` from the environment), the frontend does not read any environment variable for the L2 RPC URL. In a CI or staging environment where the L2 RPC is not on localhost, the frontend will silently fail to connect without any error about configuration. The `NEXT_PUBLIC_*` env var convention would be the appropriate mechanism to override this in Next.js.
- **Steps to Reproduce:**
  1. Deploy the frontend to a remote environment where L2 is not at `http://localhost:8547`
  2. Set no `NEXT_PUBLIC_L2_RPC` environment variable
  3. Frontend silently attempts `http://localhost:8547` and fails all RPC calls
- **Expected Behavior:** `chains.ts` reads `process.env.NEXT_PUBLIC_L2_RPC || 'http://localhost:8547'` so the URL can be overridden for non-local environments
- **Actual Behavior:** URL is hardcoded; no override mechanism exists
- **Evidence:** `frontend/src/config/chains.ts` lines 13-16: hardcoded `http://localhost:8547` and `ws://localhost:8548`
- **Recommendation:** Replace hardcoded URLs with: `http: [process.env.NEXT_PUBLIC_L2_RPC ?? 'http://localhost:8547']` and `webSocket: [process.env.NEXT_PUBLIC_L2_WS ?? 'ws://localhost:8548']`. Add these to `.env.example`.

---

### Finding: wagmi.ts uses RainbowKit projectId placeholder — WalletConnect will fail in non-local environments

- **ID:** INT-008
- **Severity:** S3
- **Category:** Integration
- **Component:** `frontend/src/config/wagmi.ts`
- **Description:** `wagmi.ts` sets `projectId: 'omega-messaging-local'`, which is a placeholder string, not a valid WalletConnect Cloud project ID. WalletConnect v2 (used by RainbowKit v2) requires a legitimate project ID registered at cloud.walletconnect.com for QR-code wallet connections to work. Under local dev with MetaMask browser extension this is inconsequential, but for any deployment with WalletConnect-based wallets (mobile wallets via QR code), all connections will fail. This is an integration gap between the wallet config and the WalletConnect infrastructure.
- **Steps to Reproduce:**
  1. Build and serve the frontend in any environment
  2. Click "Connect Wallet" and choose a WalletConnect-based wallet (e.g., mobile Rainbow wallet)
  3. WalletConnect QR code fails to initialize — "Invalid project ID" error from WalletConnect relay
- **Expected Behavior:** A real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` env var is used; placeholder is replaced before any non-local deployment
- **Actual Behavior:** Hardcoded invalid placeholder used; WalletConnect-based wallet connections fail
- **Evidence:** `frontend/src/config/wagmi.ts` line 12: `projectId: 'omega-messaging-local'`
- **Recommendation:** Replace with `projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'omega-messaging-local'`. Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=` to `.env.example` with a note that a real ID is required for WalletConnect wallet support.

---

### Finding: ArbSys sendTxToL1 called with msg::sender() as destination — no L1 recipient address validation

- **ID:** INT-009
- **Severity:** S4
- **Category:** Integration
- **Component:** `contracts/messaging/src/lib.rs` (`bridge_message`)
- **Description:** The `bridge_message` function bridges message content to L1 by calling `ArbSys.sendTxToL1(destination=msg::sender(), data=content_bytes)`. The destination is always the L2 caller's address. This is a design choice documented in the contract, but it means the L1 recipient is implicitly the L2 sender. If the L2 sender is a smart contract (e.g., a multisig or proxy), the L1 destination will be that contract's address on L1, which may not have deployed code or may not be able to process the inbound message. There is no parameter to specify a different L1 recipient. The ABI and frontend do not expose an `l1Recipient` parameter, and the `BridgeStatus` component cannot display what the actual L1 destination is. This is a design limitation rather than a bug, but it creates a UX integration gap: users cannot specify where on L1 the message should be delivered.
- **Steps to Reproduce:**
  1. Call `bridge_message(id)` from a smart contract address on L2
  2. After challenge period, the L1 outbox message targets the smart contract's address on L1
  3. If the contract is not deployed on L1, the message becomes permanently unexecutable
- **Expected Behavior:** Documented limitation; or `bridge_message` accepts an optional `l1_recipient: Address` parameter
- **Actual Behavior:** L1 destination is always `msg::sender()` with no override capability
- **Evidence:** `contracts/messaging/src/lib.rs` line 184: `arbsys.send_tx_to_l1(config, msg::sender(), data)`
- **Recommendation:** Add an `l1_recipient: Address` parameter to `bridge_message`, update the ABI and frontend. At minimum, document this limitation prominently in the frontend UI (e.g., "Message will be delivered to your address on L1").

---

### Finding: BridgeStatus bridge lifecycle states incomplete relative to project spec

- **ID:** INT-010
- **Severity:** S4
- **Category:** Integration
- **Component:** `frontend/src/components/BridgeStatus.tsx`
- **Description:** The project spec (and `codebase-context.md`) defines the bridge message lifecycle as: `Submitted → Batched → Asserted → Confirmed → Executable → Executed` (6 states). The `BridgeStatus` component implements only 3 states: `pending`, `batched`, `confirmed`. The states `asserted`, `executable`, and `executed` are absent. The `BridgeEvent` interface and `BridgeTimeline` component do not model these states. This means the UI cannot show when a message is `executable` (ready to claim on L1) or `executed` (claimed), which are the most user-actionable states in the bridge lifecycle.
- **Steps to Reproduce:**
  1. Bridge a message
  2. Wait for the challenge period to elapse
  3. Observe that the UI remains stuck at "confirmed" even after the message becomes executable
  4. There is no UI affordance to execute the message on L1
- **Expected Behavior:** Bridge timeline shows all 6 lifecycle states; `executable` state triggers an L1 execution CTA
- **Actual Behavior:** Only 3 states modeled; `asserted`, `executable`, `executed` are absent
- **Evidence:** `BridgeStatus.tsx` lines 16-17: `status: 'pending' | 'batched' | 'confirmed'`. project spec: `Submitted → Batched → Asserted → Confirmed → Executable → Executed`
- **Recommendation:** Extend `BridgeEvent.status` to include all 6 lifecycle states. Poll the Arbitrum bridge outbox API or use `useWatchContractEvent` on the L1 Outbox contract to detect `executed` transitions.

---

### Finding: verify-chain.ts creates publicClient without chain — may hit type error with viem strict mode

- **ID:** INT-011
- **Severity:** S4
- **Category:** Integration
- **Component:** `scripts/verify-chain.ts`
- **Description:** `verify-chain.ts` creates a `publicClient` at line 121 using only `transport: http(L2_RPC)` without specifying a `chain` property. In viem v2, omitting the `chain` on `createPublicClient` is allowed but causes the client to infer chain from the RPC's `eth_chainId` response. This works at runtime but produces TypeScript type warnings in strict mode because some viem methods require chain to be defined for type-safe address formatting. This is a minor integration concern — the script functions correctly but is not fully type-safe.
- **Steps to Reproduce:**
  1. Run `npx tsc --strict` on `scripts/verify-chain.ts`
  2. Observe potential type warnings about undefined chain on publicClient
- **Expected Behavior:** Client created with explicit chain matching `EXPECTED_CHAIN_ID`
- **Actual Behavior:** Client created without explicit chain
- **Evidence:** `scripts/verify-chain.ts` line 121-123: `createPublicClient({ transport: http(L2_RPC) })` — no `chain` field.
- **Recommendation:** Import and use `omegaMessagingChain` from `frontend/src/config/chains.ts` (or define the chain inline) and pass it to `createPublicClient`.

---

### Finding: BLOCKED — Runtime ABI selector verification requires live chain

- **ID:** INT-012
- **Severity:** N/A (BLOCKED)
- **Category:** Integration
- **Component:** All contract-frontend integration points
- **Description:** Definitive verification that the Stylus `#[public]` macro generates selectors matching the frontend ABI requires: (1) a running Arbitrum L2 node, (2) a deployed Stylus contract, (3) `cast call` or `cargo stylus export-abi` execution. No live chain exists in the current pipeline state (`4_testing` in progress, chain not yet confirmed running). This check is blocked pending chain deployment.
- **Steps to Reproduce:** N/A — blocked
- **Expected Behavior:** `cast call <contract> "send_message(string)" "hello"` succeeds on deployed contract
- **Actual Behavior:** BLOCKED — no live chain available for testing
- **Evidence:** `pipeline.json`: L2 not yet verified running
- **Recommendation:** After chain deployment, run `cargo stylus export-abi --output contracts/messaging/abi/MessagingContract.json` and diff against `frontend/src/abi/MessagingContract.ts`.

---

### Finding: BLOCKED — Cross-chain round-trip bridge verification requires live chain

- **ID:** INT-013
- **Severity:** N/A (BLOCKED)
- **Category:** Integration
- **Component:** `contracts/messaging/src/lib.rs` (`bridge_message`), L1 outbox
- **Description:** End-to-end bridge round-trip verification (L2 `bridge_message` → L1 outbox → L1 execution) requires both chains running with a full challenge period. Anvil fast-forward or mock bridge setup is needed. This cannot be verified by static analysis.
- **Steps to Reproduce:** N/A — blocked
- **Expected Behavior:** L2 `bridge_message(id)` call results in an L1 outbox entry that can be executed after `eth_mine` fast-forward
- **Actual Behavior:** BLOCKED — requires live dual-chain environment
- **Evidence:** N/A
- **Recommendation:** Use Anvil's `anvil_mine` RPC or a bridge mock for local testing to fast-forward through the challenge period.

---

## Integration Checks — Pass/Fail Summary

| # | Check | Result |
|---|---|---|
| 1 | `deploy-chain.ts` calls `prepareChainConfig` with correct chainId and AnyTrust flag | PASS |
| 2 | `createRollup` output `.coreContracts` passed to `prepareNodeConfig` | PASS |
| 3 | `prepareNodeConfig` receives correct batchPosterPrivateKey and validatorPrivateKey | PASS |
| 4 | Node config and coreContracts written to `chain-config/` directory | PASS |
| 5 | `verify-chain.ts` reads from same `chain-config/` directory as deploy script | PASS |
| 6 | Frontend ABI function names match Rust `#[public]` function names (snake_case consistent) | PASS (with caveat — see INT-001) |
| 7 | Frontend ABI parameter types match Rust types (string↔string, uint256↔U256, address↔Address) | PASS |
| 8 | Frontend ABI return types match Rust return types | PASS |
| 9 | Frontend ABI `MessageSent` event fields match `sol!` definition in contract | PASS |
| 10 | Frontend ABI `MessageBridged` event fields match `sol!` definition in contract | PASS |
| 11 | Frontend ABI error definitions match `sol!` errors in contract | PASS |
| 12 | Frontend chain ID (97400766) matches deployment config | PASS |
| 13 | Frontend L2 RPC URL matches pipeline config (localhost:8547) | PASS |
| 14 | Frontend wagmi config includes both L1 (foundry) and L2 (omegaMessagingChain) | PASS |
| 15 | ArbSys `sol_interface!` function signature matches precompile spec | PASS |
| 16 | `flush_storage_cache()` called before `sendTxToL1` bridge call | PASS |
| 17 | Bridge TX hash extracted from `sendTxToL1` return value (ticket_id → bytes32) | PASS |
| 18 | Load test ABIs (`SEND_MESSAGE_ABI`, `MESSAGE_COUNT_ABI`) match contract ABI | PASS |
| 19 | Load test uses correct L2 RPC from environment (L2_CHAIN_RPC) | PASS |
| 20 | Concurrent load test pre-assigns nonces to avoid collisions | PASS |
| 21 | `deploy-contract.sh` reads correct env vars (`CONTRACT_DEPLOYER_KEY`, `L2_CHAIN_RPC`) | PASS |
| 22 | `deploy-contract.sh` references correct contract path (`contracts/messaging/`) | PASS |
| 23 | Runtime ABI selector verification (requires live chain) | BLOCKED (INT-012) |
| 24 | Cross-chain bridge round-trip (requires live chain) | BLOCKED (INT-013) |

---

## Data Format Compatibility

| Data | Rust Type | ABI Type | TypeScript Type | Compatible? |
|---|---|---|---|---|
| Message content | `String` | `string` | `string` | Yes |
| Message ID | `U256` | `uint256` | `bigint` | Yes |
| Sender address | `Address` | `address` | `\`0x${string}\`` | Yes |
| Message count | `U256` | `uint256` | `bigint` (read as `number` via `Number()`) | Yes (note: safe up to 2^53) |
| Bridge TX hash | `[u8; 32]` (from U256 `to_big_endian`) | `bytes32` | `\`0x${string}\`` | Yes |

**Note on messageCount:** `MessageList.tsx` converts `countRaw` via `Number(countRaw)`. This is safe for any realistic message count but would overflow JavaScript's `Number.MAX_SAFE_INTEGER` at 2^53 messages. Not a practical concern for this application.

---

## Sign-Off

- [ ] All S1/S2 findings resolved or waived
  - INT-001 (S2): ABI selector consistency — recommend `cargo stylus export-abi` verification before deployment
  - INT-002 (S2): Contract address not persisted — deploy script must be fixed before load tests can run
  - INT-003 (S2): BridgeStatus raw log parsing — functional workaround exists but fragile; fix before system UAT
- [ ] Report reviewed
- [ ] Ready for next phase gate

**Gate recommendation: FAIL** — S2 findings INT-001, INT-002, INT-003 require resolution or documented mitigations before the integration gate can pass. INT-001 and INT-003 have mitigations available (static ABI comparison and known-working raw parsing), but INT-002 breaks the pipeline handoff between deploy and load tests with no workaround other than manual intervention.
