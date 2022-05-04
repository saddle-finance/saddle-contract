# Deploy Pull Request Template

## Description

Please include a summary of the new deploy scripts. If this PR includes any imports of externally deployed contract addresses, provide sources from official docs or trustworthy references.

Fixes # (issue)

## Deployment checklist

List any new deployments that is expected to be saved after running the deploy task. After running the scripts, check off each item if they are successfully deployed.

- [ ] PoolA
- [ ] PoolALPToken

## Deployment verification

Please provide explorer links to the deployed contracts and verify them using either standard solcInputs json or manually flattened contracts using `npx hardhat flatten`. After verifying them, check off each item.

- [ ] Link to PoolA on etherscan
- [ ] Link to PoolALPToken on etherscan

## Checklist:

- [ ] Any imported tokens's addresses are verified against official docs
- [ ] If any existing contracts are changed, ensure the saved deployments are removed before running the deploy scripts
- [ ] If deploying a new pool on a testnet, ensure there is liquidity by providing the test tokens to a DEX.
- [ ] If possible, the deploy scripts are tested against forked mainnet or local hardhat node.
- [ ] Newly deployed contracts match the expected list of new deployments
- [ ] All newly deployed contracts are verified on explorers
