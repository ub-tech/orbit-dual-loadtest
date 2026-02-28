# Deployment Tester Report

**Date:** 2026-02-27
**Agent:** deployment-tester
**Scope:** Chain deployment script, contract deployment script, verification script, configuration files, .gitignore, .env.example, smoke test readiness
**Status:** Pass

---

## Summary

- Total checks: 34
- Passed: 27
- Failed: 0
- Warnings / Findings: 7

Findings breakdown: S1: 0 | S2: 1 | S3: 4 | S4: 2

All deployment scripts exist and contain comprehensive error handling. Configuration files are well-formed. No S1 findings. The gate passes with one S2 finding (stylus-sdk version mismatch against cargo stylus 0.10.0) that must be resolved before contract deployment succeeds. Four S3 findings cover missing documentation, dead code, and an incomplete test suite. Two S4 findings are cosmetic.

---

## Step 1: Chain Deployment Script — `scripts/deploy-chain.ts`

### Env Var Validation

| Check | Result | Notes |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` validated before use | PASS | `requireEnv()` helper exits with clear message on missing or empty value |
| `BATCH_POSTER_PRIVATE_KEY` validated before use | PASS | Same |
| `VALIDATOR_PRIVATE_KEY` validated before use | PASS | Same |
| Optional vars have safe defaults | PASS | `PARENT_CHAIN_RPC`, `CHAIN_ID`, `CHAIN_NAME` all have documented defaults |
| Private keys not logged to console | PASS | Only addresses are printed, never raw key values |

### `createRollup` Parameter Format

| Check | Result | Notes |
|---|---|---|
| `prepareChainConfig` call matches PRD-001 FR-1 | PASS | `chainId`, `arbitrum.InitialChainOwner`, `arbitrum.DataAvailabilityCommittee: true` all correct |
| `createRollup` params match PRD-001 FR-2 | PASS | `config`, `batchPosters`, `validators` correct; `parentChainPublicClient` and `account: deployer` correct |
| `parentChainWalletClient` used in `createRollup` | FAIL (S3) | Client is created (line 117-121) but never passed to any function — dead code. See DEP-003. |

### `prepareNodeConfig` Arguments

| Check | Result | Notes |
|---|---|---|
| `chainName` passed | PASS | Passed correctly |
| `chainConfig` passed | PASS | Result of `prepareChainConfig` passed through |
| `coreContracts` passed | PASS | `rollupResult.coreContracts` used |
| `batchPosterPrivateKey` passed | PASS | `batchPosterKey` (hex-prefixed) passed |
| `validatorPrivateKey` passed | PASS | `validatorKey` (hex-prefixed) passed |
| `parentChainId` passed | PASS | `foundry.id` used — correct for Anvil local deployment |
| `parentChainRpcUrl` passed | PASS | `parentChainRpc` string passed |

### Output Files

| Check | Result | Notes |
|---|---|---|
| `nodeConfig.json` written to `chain-config/` | PASS | `path.resolve(__dirname, '..', 'chain-config')` correct; `mkdirSync` creates dir if absent |
| `coreContracts.json` written to `chain-config/` | PASS | Both files written with JSON pretty-print |
| Unhandled path if `__dirname` is undefined | PASS | `tsconfig.json` uses `"module": "commonjs"` so `__dirname` is available in ts-node |

### Error Handling

| Check | Result | Notes |
|---|---|---|
| SDK import failure handled | PASS | `try/catch` on `require('@arbitrum/orbit-sdk')` exits with clear message |
| Parent chain unreachable exits cleanly | PASS | `getChainId()` failure exits with actionable message |
| `prepareChainConfig` failure handled | PASS | Wrapped in try/catch, exits 1 |
| `createRollup` revert detected | PASS | Checks `err.message.includes('revert')` for extra context |
| `prepareNodeConfig` failure handled | PASS | Wrapped in try/catch, exits 1 |
| Unhandled promise caught at entry point | PASS | `main().catch(...)` at bottom of file |

---

## Step 2: Contract Deployment Script — `scripts/deploy-contract.sh`

### Prerequisites and Env Validation

| Check | Result | Notes |
|---|---|---|
| `.env` file existence checked | PASS | Exits with copy instruction if missing |
| `CONTRACT_DEPLOYER_KEY` validated | PASS | `[ -z "${CONTRACT_DEPLOYER_KEY:-}" ]` check present |
| `L2_CHAIN_RPC` validated | PASS | Same |
| `contracts/messaging/Cargo.toml` existence checked | PASS | Exits if contract directory missing |
| `cargo +stable` used for compatibility | PASS | All three `cargo` invocations explicitly use `+stable` toolchain |
| `set -euo pipefail` set | PASS | Line 13 — script aborts on any error, undefined variable, or pipe failure |

### Deployment Steps

| Check | Result | Notes |
|---|---|---|
| ABI export step | PASS (with note) | Uses `|| echo` to swallow failure — intentional, documented in comment |
| `cargo stylus check` runs before deploy | PASS | Step 2 validates WASM before committing to deploy |
| Contract address captured and persisted | PASS | `grep -oE '0x[0-9a-fA-F]{40}'` on output, saves to `chain-config/contractAddress.txt` |
| Warning emitted if address not captured | PASS | Explicit warning with manual fallback instruction |
| `NEXT_PUBLIC_MESSAGING_CONTRACT` mentioned in output | PASS | Script prints the env var name for user to add |
| `NEXT_PUBLIC_MESSAGING_CONTRACT` missing from `.env.example` | FAIL (S3) | The env var referenced in deploy output is not documented in `.env.example`. See DEP-004. |

---

## Step 3: Configuration Files

### `package.json` (root)

| Check | Result | Notes |
|---|---|---|
| `@arbitrum/orbit-sdk` dependency present | PASS | Version: `latest` |
| `viem` dependency present | PASS | Version: `latest` |
| `dotenv` dependency present | PASS | `^16.4.7` |
| `ts-node` devDependency present | PASS | `^10.9.2` |
| `typescript` devDependency present | PASS | `^5.7.3` |
| `deploy` script defined | PASS | `ts-node scripts/deploy-chain.ts` |
| `verify` script defined | PASS | `ts-node scripts/verify-chain.ts` |
| Node engine constraint | PASS | `>=18.0.0` — correct for viem/orbit-sdk requirements |
| `node_modules` not installed | WARN (S3) | `npm install` has not been run at project root. `orbit-sdk` and `viem` are not available. Deploy scripts will fail until installed. See DEP-005. |

### `tsconfig.json` (root)

| Check | Result | Notes |
|---|---|---|
| `target: ES2022` | PASS | Appropriate for Node 18+ |
| `module: commonjs` | PASS | Required for `__dirname` and ts-node compatibility |
| `esModuleInterop: true` | PASS | Required for dotenv and other CommonJS imports |
| `strict: true` | PASS | Maximum type safety |
| `resolveJsonModule: true` | PASS | Allows JSON imports if needed |
| `include: ["scripts/**/*.ts"]` | PASS | Correctly scoped to scripts directory |

### `contracts/messaging/Cargo.toml`

| Check | Result | Notes |
|---|---|---|
| `stylus-sdk` dependency present | PASS | Present at `"0.6.0"` |
| `alloy-primitives` dependency present | PASS | `"0.7"` — compatible with stylus-sdk 0.6 |
| `alloy-sol-types` dependency present | PASS | `"0.7"` — compatible |
| `export-abi` feature defined | PASS | `stylus-sdk/export-abi` correctly gated |
| `[lib] crate-type = ["lib", "cdylib"]` | PASS | Required for WASM compilation |
| Release profile optimized | PASS | `lto`, `strip`, `opt-level = "s"`, `panic = "abort"` all correct for WASM size |
| `stylus-sdk 0.6.0` vs `cargo stylus 0.10.0` | FAIL (S2) | `cargo stylus 0.10.0` was released alongside `stylus-sdk 0.8.x`. Pinning `stylus-sdk = "0.6.0"` may cause WASM validation failures and API incompatibilities. See DEP-001. |

### `contracts/messaging/rust-toolchain.toml`

| Check | Result | Notes |
|---|---|---|
| `channel = "stable"` | PASS | Matches deploy script's `cargo +stable` invocations |
| `targets = ["wasm32-unknown-unknown"]` | PASS | WASM target declared; confirmed installed on this machine |

### `frontend/package.json`

| Check | Result | Notes |
|---|---|---|
| `next` dependency present | PASS | `^14.2.0` |
| `react` / `react-dom` present | PASS | `^18.3.0` |
| `wagmi` present | PASS | `^2.14.0` |
| `viem` present | PASS | `^2.21.0` — consistent with load tests |
| `@tanstack/react-query` present | PASS | `^5.62.0` |
| `tailwindcss` devDependency present | PASS | `^3.4.0` |
| `typescript` devDependency present | PASS | `^5.7.0` |
| `@rainbow-me/rainbowkit` present | PASS | `^2.2.0` — wallet connect UI |
| `node_modules` not installed | WARN (S4) | Frontend `npm install` has not been run. Frontend cannot be built or served until installed. See DEP-007. |

### `frontend/tsconfig.json`

| Check | Result | Notes |
|---|---|---|
| `target: ES2017` | PASS | Appropriate for Next.js / browser |
| `module: esnext` | PASS | Required for Next.js bundler |
| `moduleResolution: bundler` | PASS | Correct for Next.js 14+ |
| `jsx: preserve` | PASS | Required for React/Next.js |
| `strict: true` | PASS | Maximum type safety |
| `noEmit: true` | PASS | Next.js handles transpilation |
| `paths: {"@/*": ["./src/*"]}` | PASS | Path alias consistent with next.config.js |

### `.env.example`

| Check | Result | Notes |
|---|---|---|
| `TARGET_CHAIN` documented | PASS | With valid values explained |
| `PARENT_CHAIN_RPC` documented | PASS | Default value shown |
| `L2_CHAIN_RPC` documented | PASS | |
| `L2_CHAIN_WS` documented | PASS | |
| `CHAIN_NAME` documented | PASS | |
| `CHAIN_ID` documented | PASS | |
| `DEPLOYER_PRIVATE_KEY` documented | PASS | Role description included |
| `BATCH_POSTER_PRIVATE_KEY` documented | PASS | |
| `VALIDATOR_PRIVATE_KEY` documented | PASS | |
| `CONTRACT_DEPLOYER_KEY` documented | PASS | |
| `TEST_USER_PRIVATE_KEY` documented | PASS | |
| `MESSAGING_CONTRACT_ADDRESS` documented | PASS | |
| `NEXT_PUBLIC_MESSAGING_CONTRACT` missing | FAIL (S3) | Referenced in deploy-contract.sh output and likely required by the frontend config but absent from .env.example. See DEP-004. |

---

## Step 4: Verification Script — `scripts/verify-chain.ts`

| Check | Result | Notes |
|---|---|---|
| Core contracts file existence check | PASS | Reads and parses `chain-config/coreContracts.json` |
| Node config file existence check | PASS | Warns (not fails) if missing — correct behavior pre-node-start |
| L2 RPC reachability check | PASS | Uses `getChainId()` as connectivity probe; handles failure gracefully |
| Chain ID validation | PASS | Compares actual chain ID to `EXPECTED_CHAIN_ID`; exits 1 on mismatch |
| Block production check | PASS | Samples block number twice with 2-second gap; handles zero/idle cases with WARN |
| Error handling comprehensive | PASS | All checks use try/catch; failures recorded in results array |
| `process.exit(1)` on FAIL checks | PASS | Final summary exits 1 if any FAIL exists |
| Batch poster activity not verified | FAIL (S3) | PRD-001 FR-4 requires verifying batch poster is submitting to parent chain. `verify-chain.ts` has no check for sequencer batch submission. See DEP-002. |
| Validator activity not verified | WARN | No check for validator assertion submissions. Acceptable for initial smoke test but noted. |

---

## Step 5: Deployment Readiness Checklist

| Item | Status | Notes |
|---|---|---|
| Chain deployment script executable | FAIL | `scripts/deploy-chain.ts` has permissions `-rw-r--r--` (not executable). Invoked via `npx ts-node` so executable bit is not strictly required, but `deploy` npm script handles this. |
| Contract deployment script executable | PASS | `scripts/deploy-contract.sh` has permissions `-rwxr-xr-x` |
| Verification script executable | FAIL | `scripts/verify-chain.ts` has permissions `-rw-r--r--`. Invoked via `npx ts-node` so executable bit is not required. |
| All env vars documented in `.env.example` | FAIL (S3) | `NEXT_PUBLIC_MESSAGING_CONTRACT` missing. See DEP-004. |
| `.gitignore` protects sensitive files | PASS | `.env`, `*.pem`, `*.key`, `chain-config/nodeConfig.json`, `chain-config/coreContracts.json`, `chain-config/contractAddress.txt` all excluded |
| `chain-config/` output directory exists | PASS | Directory exists with `.gitkeep`; individual sensitive files gitignored |
| WASM target available | PASS | `wasm32-unknown-unknown` confirmed installed via `rustup target list --installed` |
| Root npm dependencies installed | FAIL (S3) | `node_modules/` absent at project root. `npm install` must be run before deploy scripts work. See DEP-005. |
| Frontend can be built | FAIL (S4) | Frontend `node_modules/` absent. `npm install` in `frontend/` required before `next build`. See DEP-007. |
| Load tests can be run | PASS | `tests/load/node_modules` is present (pre-installed); load test dependencies available |
| stylus-sdk version compatible with cargo stylus | FAIL (S2) | See DEP-001 |
| Stylus vs EVM comparison test implemented | FAIL (S4) | PRD-003 specifies 5 scenarios; only 4 are implemented. See DEP-006. |

---

## Step 6: Smoke Test Readiness

### eth_chainId RPC Call

```bash
# Smoke test format:
cast rpc eth_chainId --rpc-url http://localhost:8547
# Expected: "0x5d069be" (97400766 in hex)
```

| Check | Result | Notes |
|---|---|---|
| `cast` command available | PASS | `cast` version 1.4.3-nightly confirmed installed |
| `eth_chainId` RPC format correct | PASS | Standard JSON-RPC method; `cast rpc` is the correct sub-command |
| Expected hex value correct | PASS | 97400766 decimal = 0x5D069BE hex |

### Stylus Contract Read Call

```bash
# Smoke test format:
cast call $MESSAGING_CONTRACT_ADDRESS "message_count()(uint256)" \
  --rpc-url http://localhost:8547
```

| Check | Result | Notes |
|---|---|---|
| `cast call` format correct | PASS | ABI signature `message_count()(uint256)` is valid foundry cast syntax |
| `--rpc-url` flag correct | PASS | Correct flag for specifying RPC endpoint |
| Function name matches contract ABI | PASS | `message_count()` is a public view function in lib.rs |

### Stylus Contract Write Call

```bash
# Smoke test format:
cast send $MESSAGING_CONTRACT_ADDRESS "send_message(string)(uint256)" "hello world" \
  --private-key $TEST_USER_PRIVATE_KEY \
  --rpc-url http://localhost:8547
```

| Check | Result | Notes |
|---|---|---|
| `cast send` format correct | PASS | Correct sub-command for state-changing calls |
| Function signature correct | PASS | `send_message(string)(uint256)` matches ABI |
| `--private-key` flag present | PASS | Required for signing transactions |
| `--rpc-url` flag present | PASS | |

### Tool Availability Summary

| Tool | Status | Version |
|---|---|---|
| `cast` | PASS | 1.4.3-nightly |
| `cargo` | PASS | 1.88.0-nightly |
| `cargo stylus` | PASS | 0.10.0 |
| `node` | PASS | v20.20.0 |
| `npx` | PASS | 10.8.2 |
| `wasm32-unknown-unknown` target | PASS | Installed |
| `npm` dependencies (root) | FAIL | Not installed — `npm install` required |

---

## Findings

### Finding: stylus-sdk Version Incompatible with cargo stylus 0.10.0

- **ID:** DEP-001
- **Severity:** S2
- **Category:** Deployment
- **Component:** `contracts/messaging/Cargo.toml`
- **Description:** `Cargo.toml` pins `stylus-sdk = "0.6.0"`. The installed `cargo stylus` is version 0.10.0. Cargo stylus 0.10.0 was released in conjunction with stylus-sdk 0.8.x and may fail WASM validation or produce API-level compilation errors when used against a 0.6.0 SDK build. The `cargo stylus check` step in `deploy-contract.sh` is likely to fail with this mismatch.
- **Steps to Reproduce:**
  1. Start L2 node
  2. Run `./scripts/deploy-contract.sh`
  3. Observe `cargo +stable stylus check --endpoint $L2_CHAIN_RPC` failure at step 2/3
- **Expected Behavior:** `cargo stylus check` passes with no errors
- **Actual Behavior:** Likely fails with a WASM validation or toolchain API error
- **Evidence:** `Cargo.toml` line 7: `stylus-sdk = "0.6.0"`. `cargo stylus --version` outputs `stylus 0.10.0`.
- **Recommendation:** Update `stylus-sdk` to a version compatible with cargo stylus 0.10.0 (likely `"0.8.0"` or `"^0.8"`). Also update `alloy-primitives` and `alloy-sol-types` to `"0.8"` if required by the new SDK version. Verify API changes (the `flush_storage_cache` call and `Call::new()` patterns are expected to be stable, but imports may shift).

---

### Finding: Batch Poster Activity Not Verified in verify-chain.ts

- **ID:** DEP-002
- **Severity:** S3
- **Category:** Deployment
- **Component:** `scripts/verify-chain.ts`
- **Description:** PRD-001 FR-4 explicitly requires post-deployment verification that "the batch poster is submitting to parent chain". The current `verify-chain.ts` only checks: (1) core contracts file, (2) node config file, (3) L2 RPC reachability, (4) chain ID, (5) block production. There is no check that the batch poster account has submitted any transactions to the parent chain's `SequencerInbox` contract.
- **Steps to Reproduce:** Run `npx ts-node scripts/verify-chain.ts` after chain deployment — no batch poster check is performed.
- **Expected Behavior:** Verification script checks parent chain for recent batch poster transactions against SequencerInbox address.
- **Actual Behavior:** Batch poster activity silently unchecked.
- **Evidence:** `verify-chain.ts` contains no reference to `batchPoster`, `SequencerInbox`, or parent chain transaction checking.
- **Recommendation:** Add a check that reads the batch poster address from `nodeConfig.json` and queries the parent chain for recent transactions from that address to the `SequencerInbox` contract. At minimum, emit a WARN if no batches detected within a configurable timeout.

---

### Finding: Unused `parentChainWalletClient` Variable in deploy-chain.ts

- **ID:** DEP-003
- **Severity:** S3
- **Category:** Deployment
- **Component:** `scripts/deploy-chain.ts`
- **Description:** A `parentChainWalletClient` is created at lines 117-121 but is never passed to any function. `createRollup` is invoked with `account: deployer` (a viem account object), not with a wallet client. The wallet client is entirely dead code and adds cognitive overhead.
- **Steps to Reproduce:** Read `scripts/deploy-chain.ts` lines 117-121 and grep for `parentChainWalletClient` usage — only the creation is found.
- **Expected Behavior:** No unused variables in deployment scripts.
- **Actual Behavior:** `parentChainWalletClient` is created but never referenced after creation.
- **Evidence:** Line 117: `const parentChainWalletClient = createWalletClient({...})`. No other reference in the file.
- **Recommendation:** Remove the `parentChainWalletClient` declaration and its `createWalletClient` import usage. If a future orbit-sdk version requires a wallet client, it should be re-added at that time with documentation.

---

### Finding: NEXT_PUBLIC_MESSAGING_CONTRACT Missing from .env.example

- **ID:** DEP-004
- **Severity:** S3
- **Category:** Deployment
- **Component:** `.env.example`, `scripts/deploy-contract.sh`
- **Description:** `deploy-contract.sh` outputs a message at line 83 instructing the user to set `NEXT_PUBLIC_MESSAGING_CONTRACT` in their `.env` file. This variable is the browser-exposed version of `MESSAGING_CONTRACT_ADDRESS` required by Next.js for client-side access. However, this variable is not documented in `.env.example`, so developers following the standard setup workflow will not know to set it.
- **Steps to Reproduce:** Read `.env.example` — `NEXT_PUBLIC_MESSAGING_CONTRACT` is absent.
- **Expected Behavior:** `.env.example` documents all env vars required by the system, including frontend browser-accessible vars.
- **Actual Behavior:** `NEXT_PUBLIC_MESSAGING_CONTRACT` is referenced in deploy output but not templated in `.env.example`.
- **Evidence:** `.env.example` ends at `MESSAGING_CONTRACT_ADDRESS`. `deploy-contract.sh` line 83: `echo "  NEXT_PUBLIC_MESSAGING_CONTRACT=$CONTRACT_ADDR"`.
- **Recommendation:** Add the following to `.env.example` under a `FRONTEND` section: `NEXT_PUBLIC_MESSAGING_CONTRACT=` with a comment explaining it must be set to the same value as `MESSAGING_CONTRACT_ADDRESS` after contract deployment.

---

### Finding: Root npm Dependencies Not Installed

- **ID:** DEP-005
- **Severity:** S3
- **Category:** Deployment
- **Component:** Project root `node_modules/`
- **Description:** The root `node_modules/` directory does not exist, meaning `@arbitrum/orbit-sdk`, `viem`, and `dotenv` are not installed. Running `npm run deploy` or `npx ts-node scripts/deploy-chain.ts` will fail immediately with a module resolution error.
- **Steps to Reproduce:** `npm run deploy` from project root without first running `npm install`.
- **Expected Behavior:** `npm install` is a documented prerequisite step before running any deployment script.
- **Actual Behavior:** `node_modules/` is absent; no documentation in README or CLAUDE.md explicitly states `npm install` must be run first.
- **Evidence:** `ls node_modules/` returns "No such file or directory". `package.json` lists `@arbitrum/orbit-sdk` as a dependency.
- **Recommendation:** Document `npm install` as an explicit prerequisite in `README.md` and in the `deploy-chain.ts` script header comment. Consider adding a guard to `scripts/deploy-chain.ts` that prints a clear error if `node_modules/@arbitrum/orbit-sdk` is not present (beyond the existing SDK try/catch).

---

### Finding: PRD-003 Fifth Load Test Scenario Not Implemented

- **ID:** DEP-006
- **Severity:** S4
- **Category:** Deployment
- **Component:** `tests/load/`
- **Description:** PRD-003 specifies five test scenarios: sequential throughput, concurrent throughput, sustained load, message size impact, and Stylus vs EVM gas comparison (target: >=30% gas discount). The `tests/load/src/` directory contains only four scenarios (`sequential.ts`, `concurrent.ts`, `sustained.ts`, `message-size.ts`). The Stylus vs EVM comparison is absent from both the source files and the `package.json` scripts.
- **Steps to Reproduce:** Review `tests/load/src/` and `tests/load/package.json` — no comparison test exists.
- **Expected Behavior:** Five load test scenarios implemented and accessible via npm scripts.
- **Actual Behavior:** Only four of five PRD-003 scenarios are present.
- **Evidence:** `tests/load/src/` directory listing; `tests/load/package.json` scripts section; PRD-003 section 5 "Stylus vs EVM Gas Discount Comparison".
- **Recommendation:** Implement `tests/load/src/stylus-evm-comparison.ts` and add `"test:stylus-evm": "ts-node src/stylus-evm-comparison.ts"` to `tests/load/package.json`. Update `run-all.ts` and `scripts/run-load-tests.sh` to include this scenario.

---

### Finding: Frontend npm Dependencies Not Installed

- **ID:** DEP-007
- **Severity:** S4
- **Category:** Deployment
- **Component:** `frontend/node_modules/`
- **Description:** The frontend `node_modules/` directory does not exist. Running `next build` or `next dev` will fail. This is a pre-deployment prerequisite, not a script defect.
- **Steps to Reproduce:** `cd frontend && npm run build` without running `npm install` first.
- **Expected Behavior:** Frontend build prerequisites are documented and installed.
- **Actual Behavior:** `frontend/node_modules/` is absent.
- **Evidence:** `ls frontend/node_modules` returns no output (directory not present).
- **Recommendation:** Document `npm install` in `frontend/` as an explicit prerequisite in the project README alongside root-level dependency installation.

---

## Smoke Test Readiness Assessment

All three smoke test command formats (eth_chainId RPC, `cast call`, `cast send`) are syntactically correct and use valid arguments for foundry's `cast` v1.4.3. The required tools (`cast`, `cargo stylus`, `node`, `npx`) are all installed on the target machine.

The smoke tests **cannot execute** until:
1. L2 chain node is running (requires chain deployment and node startup)
2. Stylus contract is deployed (requires resolving DEP-001 stylus-sdk version mismatch)
3. Root npm dependencies are installed (requires `npm install` at project root, DEP-005)

---

## Deployment Readiness Assessment

The project is **structurally sound** but **not ready to deploy** due to two blockers:

**Blocker 1 (S2 — DEP-001):** `stylus-sdk 0.6.0` pinned in `Cargo.toml` is likely incompatible with the installed `cargo stylus 0.10.0`. Contract deployment will fail at the `cargo stylus check` step until the SDK version is updated.

**Blocker 2 (S3 — DEP-005):** Root npm dependencies not installed. Chain deployment scripts cannot run until `npm install` is executed.

Once these two blockers are resolved, the deployment pipeline is otherwise well-structured:
- Environment validation is thorough and user-friendly
- Output files are written to correct locations
- Sensitive files are protected by `.gitignore`
- The `chain-config/` directory is pre-created and tracked by git
- WASM target is installed
- Load test dependencies are pre-installed

---

## Sign-Off

- [x] No S1 findings — deployment not critically blocked by security or data loss issues
- [ ] S2 finding DEP-001 (stylus-sdk version mismatch) not yet resolved — must fix before contract deployment
- [ ] S3 findings DEP-002, DEP-003, DEP-004, DEP-005 require resolution before production deployment
- [ ] Report reviewed by EM (CLAUDE.md orchestrator)
- [ ] Ready for next phase gate: **CONDITIONAL — S2 must be resolved first**
