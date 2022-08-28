# saddle-contract

[![codecov](https://codecov.io/gh/saddle-finance/saddle-contract/branch/master/graph/badge.svg?token=CI26SD9SGE)](https://codecov.io/gh/saddle-finance/saddle-contract)
[![CI](https://github.com/saddle-finance/saddle-contract/workflows/CI/badge.svg)](https://github.com/saddle-finance/saddle-contract/actions?query=workflow%3ACI)

The smart contracts behind [saddle.finance](https://saddle.finance) 🤠

The contracts are compiled with [Hardhat](https://hardhat.org/getting-started/), and tested using [Waffle](https://hardhat.org/guides/waffle-testing.html#testing-with-ethers-js-waffle) and [TypeScript](https://hardhat.org/guides/typescript.html#typescript-support).

## Installation

```bash
$ npm ci --legacy-peer-deps
```

## Usage

### Build

```bash
$ npm run build
```

### Test

```bash
$ npm test
```

### Coverage

```bash
$ npm run coverage
```

### Deploying contracts to localhost Hardhat EVM

```bash
$ npm run start
```
You can connect to this RPC server via `http://localhost:8545` with chain ID of 31337

### Deploying contracts to local fork of a network

In order to successfully fork a network, the networks have to be defined in hardhat.config.ts with valid RPC URLs. In case of mainnet, `ALCHEMY_API` must be set to a valid URL in the `.env` file. 
```
ALCHEMY_API="https://eth-mainnet.alchemyapi.io/v2/XXXXXXXXXXXX"
```

```bash
$ npm run fork --network=mainnet
```
You can connect to this RPC server via `http://localhost:8545` with chain ID of the network.

Additionally, you can choose a block number to fork from by setting `FORK_BLOCK_NUMBER` env variable.

### Deploying contracts to Ropsten

In order to successfully deploy to Ropsten, `ALCHEMY_API_ROPSTEN` must be set to a valid URL in the `.env` file.
MNEMONIC_TEST_ACCOUNT must be set and the accounts must have some rEth for successful deployments.
```
ALCHEMY_API="https://eth-ropsten.alchemyapi.io/v2/XXXXXXXXXXXX"
MNEMONIC_TEST_ACCOUNT="seed phrase"
```


### Generating GitBook docs

```bash
$ npx solidity-docgen --templates=templates
```

The output in the `docs` folder should be copied to the appropriate folder in the [saddle-docs repo](https://github.com/saddle-finance/saddle-docs/tree/master/solidity-docs).

### Running Slither

[Slither](https://github.com/crytic/slither) is a Solidity static analysis framework. To run it locally:

```bash
$ pip3 install slither-analyzer
$ slither .
```

Slither is configured to run as a GitHub Action and error on any high findings.
