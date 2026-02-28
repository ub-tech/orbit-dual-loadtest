/**
 * deploy-chain.ts
 *
 * Deploys an Arbitrum rollup chain on a parent chain using the Orbit SDK.
 *
 * Supported parent chains:
 *   - Anvil forking Sepolia:  anvil --fork-url $SEPOLIA_RPC_URL
 *   - Direct Sepolia RPC:     set PARENT_CHAIN_RPC to your Sepolia endpoint
 *   - Nitro testnode:         set PARENT_CHAIN_RPC=http://localhost:8545
 *
 * Note: A plain Anvil instance (not forking) will NOT work — the Orbit
 * RollupCreator contract must already be deployed on the parent chain.
 *
 * Usage:
 *   npx ts-node scripts/deploy-chain.ts
 *
 * Required environment variables (loaded from .env):
 *   DEPLOYER_PRIVATE_KEY       - Chain deployer / owner private key
 *   BATCH_POSTER_PRIVATE_KEY   - Batch poster private key
 *   VALIDATOR_PRIVATE_KEY      - Validator private key
 *
 * Optional environment variables:
 *   PARENT_CHAIN_RPC  - Parent chain RPC URL (default: http://localhost:8545)
 *   CHAIN_ID          - L2 chain ID (default: 97400766)
 *   CHAIN_NAME        - Human-readable chain name (default: omega-messaging-chain)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, zeroAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// ---------------------------------------------------------------------------
// Orbit SDK imports — wrapped in try/catch so missing package gives a clear
// message rather than an opaque module-resolution crash.
// ---------------------------------------------------------------------------
let prepareChainConfig: typeof import('@arbitrum/orbit-sdk')['prepareChainConfig'];
let createRollup: typeof import('@arbitrum/orbit-sdk')['createRollup'];
let createRollupPrepareDeploymentParamsConfig: typeof import('@arbitrum/orbit-sdk')['createRollupPrepareDeploymentParamsConfig'];
let prepareNodeConfig: typeof import('@arbitrum/orbit-sdk')['prepareNodeConfig'];

try {
  const orbitSdk = require('@arbitrum/orbit-sdk');
  prepareChainConfig = orbitSdk.prepareChainConfig;
  createRollup = orbitSdk.createRollup;
  createRollupPrepareDeploymentParamsConfig = orbitSdk.createRollupPrepareDeploymentParamsConfig;
  prepareNodeConfig = orbitSdk.prepareNodeConfig;
} catch {
  console.error(
    'ERROR: @arbitrum/orbit-sdk is not installed.\n' +
      'Run `npm install` first, then retry this script.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load environment
// ---------------------------------------------------------------------------
dotenv.config();

/** Ensure a private key has the 0x prefix */
function ensureHexPrefix(key: string): `0x${string}` {
  if (key.startsWith('0x')) return key as `0x${string}`;
  return `0x${key}` as `0x${string}`;
}

/** Require an environment variable and return it, or exit with a clear error */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`ERROR: Required environment variable ${name} is not set.`);
    console.error('Copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// Main deployment routine
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  Omega Messaging Chain — Deployment Script');
  console.log('='.repeat(70));
  console.log();

  // -----------------------------------------------------------------------
  // 1. Load & validate environment
  // -----------------------------------------------------------------------
  const deployerKey = ensureHexPrefix(requireEnv('DEPLOYER_PRIVATE_KEY'));
  const batchPosterKey = ensureHexPrefix(requireEnv('BATCH_POSTER_PRIVATE_KEY'));
  const validatorKey = ensureHexPrefix(requireEnv('VALIDATOR_PRIVATE_KEY'));

  const parentChainRpc = process.env.PARENT_CHAIN_RPC || 'http://localhost:8545';
  const chainId = Number(process.env.CHAIN_ID) || 97400766;
  const chainName = process.env.CHAIN_NAME || 'omega-messaging-chain';

  console.log(`Parent chain RPC : ${parentChainRpc}`);
  console.log(`Chain ID          : ${chainId}`);
  console.log(`Chain name        : ${chainName}`);
  console.log();

  // -----------------------------------------------------------------------
  // 2. Create accounts from private keys
  // -----------------------------------------------------------------------
  const deployer = privateKeyToAccount(deployerKey);
  const batchPoster = privateKeyToAccount(batchPosterKey);
  const validator = privateKeyToAccount(validatorKey);

  console.log('Accounts:');
  console.log(`  Deployer      : ${deployer.address}`);
  console.log(`  Batch Poster  : ${batchPoster.address}`);
  console.log(`  Validator     : ${validator.address}`);
  console.log();

  // -----------------------------------------------------------------------
  // 3. Create viem clients
  //
  // We use `sepolia` as the chain definition because the Orbit SDK
  // validates the parent chain ID against its known list. When forking
  // Sepolia with Anvil, the RPC reports chain ID 11155111 (Sepolia),
  // which the SDK recognises.
  // -----------------------------------------------------------------------
  const parentChainPublicClient = createPublicClient({
    chain: sepolia,
    transport: http(parentChainRpc),
  });

  const parentChainWalletClient = createWalletClient({
    chain: sepolia,
    transport: http(parentChainRpc),
    account: deployer,
  });

  // Verify parent chain is reachable
  try {
    const parentChainId = await parentChainPublicClient.getChainId();
    console.log(`Parent chain reachable — chain ID: ${parentChainId}`);
  } catch (err) {
    console.error('ERROR: Cannot reach the parent chain RPC at', parentChainRpc);
    console.error(
      'Make sure your parent chain is running.\n' +
        'For local dev, fork Sepolia:  anvil --fork-url $SEPOLIA_RPC_URL  (set in .env)',
    );
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 4. Prepare chain config + deployment params
  // -----------------------------------------------------------------------
  console.log('\nPreparing chain config...');

  let chainConfig: ReturnType<typeof prepareChainConfig>;
  try {
    chainConfig = prepareChainConfig({
      chainId,
      arbitrum: {
        InitialChainOwner: deployer.address,
        DataAvailabilityCommittee: false,
        MaxCodeSize: 65536,     // 64 KB — default 24 KB is too small for Stylus WASM
        MaxInitCodeSize: 131072, // 128 KB
      },
    });
    console.log('  Chain config prepared successfully.');
  } catch (err) {
    console.error('ERROR: Failed to prepare chain config.');
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    process.exit(1);
  }

  console.log('Preparing deployment params config...');

  let deploymentConfig: ReturnType<typeof createRollupPrepareDeploymentParamsConfig>;
  try {
    deploymentConfig = createRollupPrepareDeploymentParamsConfig(
      parentChainPublicClient as any,
      {
        chainId: BigInt(chainId),
        owner: deployer.address,
        chainConfig,
      },
    );
    console.log('  Deployment params config prepared successfully.');
  } catch (err) {
    console.error('ERROR: Failed to prepare deployment params config.');
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 5. Create rollup
  // -----------------------------------------------------------------------
  console.log('\nCreating rollup (this may take a moment)...');

  let rollupResult: Awaited<ReturnType<typeof createRollup>>;
  try {
    rollupResult = await createRollup({
      params: {
        config: deploymentConfig,
        batchPosters: [batchPoster.address],
        validators: [validator.address],
        deployFactoriesToL2: false,
      },
      parentChainPublicClient,
      account: deployer,
    });
    console.log('  Rollup created successfully!');
  } catch (err) {
    console.error('ERROR: createRollup transaction failed.');
    if (err instanceof Error) {
      console.error(`  Detail: ${err.message}`);
      if (err.message.includes('revert')) {
        console.error('  The transaction reverted — check deployer balance and chain state.');
      }
    }
    process.exit(1);
  }

  // Log core contract addresses
  const coreContracts = rollupResult.coreContracts;
  console.log('\nCore Contracts:');
  for (const [name, address] of Object.entries(coreContracts)) {
    console.log(`  ${name.padEnd(24)} : ${address}`);
  }

  // Log transaction hash if available
  if ('transactionHash' in rollupResult) {
    console.log(`\nDeployment TX hash: ${(rollupResult as any).transactionHash}`);
  }

  // -----------------------------------------------------------------------
  // 6. Fund validator with WETH for staking
  // -----------------------------------------------------------------------
  const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address;
  const stakeAmount = BigInt(2) * BigInt('1000000000000000000'); // 2 WETH

  console.log('\nWrapping ETH -> WETH for validator staking...');
  try {
    const validatorWalletClient = createWalletClient({
      chain: sepolia,
      transport: http(parentChainRpc),
      account: validator,
    });

    // Wrap ETH by calling WETH.deposit{value: stakeAmount}()
    const wrapTxHash = await validatorWalletClient.sendTransaction({
      to: WETH_ADDRESS,
      value: stakeAmount,
      data: '0xd0e30db0' as `0x${string}`, // deposit() selector
    } as any);
    await parentChainPublicClient.waitForTransactionReceipt({ hash: wrapTxHash });
    console.log(`  Wrapped ${Number(stakeAmount) / 1e18} ETH -> WETH for validator.`);
  } catch (err) {
    console.error('WARNING: Failed to wrap ETH for validator staking.');
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    console.error('  The staker may fail to post assertions until funded with WETH.');
  }

  // -----------------------------------------------------------------------
  // 7. Fund deployer on L2 via Inbox.createRetryableTicket()
  //
  // The deployer (chain owner) has ETH on L1 but zero on L2. We use
  // createRetryableTicket (not depositEth) because depositEth applies
  // the L1-to-L2 address alias, sending funds to the wrong address.
  // createRetryableTicket lets us specify the exact L2 recipient.
  // -----------------------------------------------------------------------
  const DEPOSIT_AMOUNT = BigInt(10) * BigInt('1000000000000000000'); // 10 ETH
  const MAX_SUBMISSION_COST = BigInt('10000000000000000');           // 0.01 ETH
  const GAS_LIMIT = BigInt(100000);
  const MAX_FEE_PER_GAS = BigInt('1000000000');                     // 1 gwei
  const TOTAL_VALUE = DEPOSIT_AMOUNT + MAX_SUBMISSION_COST + GAS_LIMIT * MAX_FEE_PER_GAS;
  const inboxAddress = (coreContracts as any).inbox as Address;

  console.log(`\nFunding deployer on L2 via Inbox.createRetryableTicket() (${Number(DEPOSIT_AMOUNT) / 1e18} ETH)...`);
  try {
    const { encodeFunctionData } = await import('viem');
    const inboxAbi = [{
      name: 'createRetryableTicket',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'l2CallValue', type: 'uint256' },
        { name: 'maxSubmissionCost', type: 'uint256' },
        { name: 'excessFeeRefundAddress', type: 'address' },
        { name: 'callValueRefundAddress', type: 'address' },
        { name: 'gasLimit', type: 'uint256' },
        { name: 'maxFeePerGas', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
      outputs: [{ type: 'uint256' }],
    }] as const;

    const data = encodeFunctionData({
      abi: inboxAbi,
      functionName: 'createRetryableTicket',
      args: [
        deployer.address,   // to: credit deployer on L2
        DEPOSIT_AMOUNT,      // l2CallValue
        MAX_SUBMISSION_COST, // maxSubmissionCost
        deployer.address,    // excessFeeRefundAddress
        deployer.address,    // callValueRefundAddress
        GAS_LIMIT,           // gasLimit for auto-redeem
        MAX_FEE_PER_GAS,     // maxFeePerGas
        '0x' as `0x${string}`, // empty calldata
      ],
    });

    const depositTxHash = await parentChainWalletClient.sendTransaction({
      to: inboxAddress,
      value: TOTAL_VALUE,
      data,
    } as any);
    await parentChainPublicClient.waitForTransactionReceipt({ hash: depositTxHash });
    console.log(`  Deposited ${Number(DEPOSIT_AMOUNT) / 1e18} ETH to L2 for deployer (${deployer.address}).`);
    console.log('  Note: Funds arrive after the L2 node processes the delayed inbox message (~30s).');
  } catch (err) {
    console.error('WARNING: Failed to deposit ETH to L2 for deployer.');
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    console.error('  You may need to manually fund the deployer on L2 before deploying contracts.');
  }

  // -----------------------------------------------------------------------
  // 8. Generate node config
  // -----------------------------------------------------------------------
  console.log('\nGenerating node configuration...');

  let nodeConfig: ReturnType<typeof prepareNodeConfig>;
  try {
    nodeConfig = prepareNodeConfig({
      chainName,
      chainConfig,
      coreContracts: rollupResult.coreContracts,
      batchPosterPrivateKey: batchPosterKey,
      validatorPrivateKey: validatorKey,
      stakeToken: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // Sepolia WETH
      parentChainId: sepolia.id,
      parentChainRpcUrl: parentChainRpc,
      parentChainBeaconRpcUrl: process.env.PARENT_CHAIN_BEACON_RPC || parentChainRpc,
    });
    console.log('  Node config generated successfully.');
  } catch (err) {
    console.error('ERROR: Failed to generate node configuration.');
    if (err instanceof Error) console.error(`  Detail: ${err.message}`);
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 8b. Patch node config for local dev (Anvil fork)
  //
  // The SDK generates config targeting a real Sepolia node with beacon
  // chain and remote DAS servers. For local Anvil we need to:
  //   - Disable the blob reader (no beacon chain API on Anvil)
  //   - Use local file/db storage instead of remote DAS servers
  // -----------------------------------------------------------------------
  const nc = nodeConfig as any;
  if (nc.node?.dangerous) {
    nc.node.dangerous['disable-blob-reader'] = true;
  }
  if (nc.node?.staker) {
    nc.node.staker = { enable: false };
  }
  if (nc.node?.['data-availability']) {
    nc.node['data-availability'] = { enable: false };
  }

  // -----------------------------------------------------------------------
  // 9. Write output files
  // -----------------------------------------------------------------------
  const outDir = path.resolve(__dirname, '..', 'chain-config');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const nodeConfigPath = path.join(outDir, 'nodeConfig.json');
  const coreContractsPath = path.join(outDir, 'coreContracts.json');

  fs.writeFileSync(nodeConfigPath, JSON.stringify(nodeConfig, null, 2) + '\n');
  console.log(`\nWrote node config      -> ${nodeConfigPath}`);

  fs.writeFileSync(coreContractsPath, JSON.stringify(coreContracts, null, 2) + '\n');
  console.log(`Wrote core contracts   -> ${coreContractsPath}`);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('  Deployment complete!');
  console.log('='.repeat(70));
  console.log();
  console.log('Next steps:');
  console.log('  1. Start the Arbitrum node with the generated nodeConfig.json');
  console.log('  2. Run `npx ts-node scripts/verify-chain.ts` to verify the chain');
  console.log('  3. Deploy Stylus contracts to the L2 chain');
  console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error('\nUnhandled error during deployment:');
  console.error(err);
  process.exit(1);
});
