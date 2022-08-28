// Saddle's Multisig address that owns various contracts
// List of signers can be found here: https://docs.saddle.finance/faq#who-controls-saddles-admin-keys

import { CHAIN_ID } from "./network"

export const MULTISIG_ADDRESSES = {
  // Hardhat's default account
  [CHAIN_ID.HARDHAT]: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  // Ropsten test account
  [CHAIN_ID.ROPSTEN]: "0xc4b5B4a43f39cD6e99cc85Fa0672dFa3c1c721AD",
  // https://gnosis-safe.io/app/eth:0x3F8E527aF4e0c6e763e8f368AC679c44C45626aE/settings
  [CHAIN_ID.MAINNET]: "0x3F8E527aF4e0c6e763e8f368AC679c44C45626aE",
  // https://gnosis-safe.io/app/arb1:0x8e6e84DDab9d13A17806d34B097102605454D147/settings
  [CHAIN_ID.ARBITRUM_MAINNET]: "0x8e6e84DDab9d13A17806d34B097102605454D147",
  // https://gnosis-safe.io/app/oeth:0x91804c72076aDd9fAB49b2c1e1A61A7503199599/settings
  [CHAIN_ID.OPTIMISM_MAINNET]: "0x91804c72076aDd9fAB49b2c1e1A61A7503199599",
  // https://safe.fantom.network/#/safes/0xa70b1d5956DAb595E47a1Be7dE8FaA504851D3c5
  [CHAIN_ID.FANTOM_MAINNET]: "0xa70b1d5956DAb595E47a1Be7dE8FaA504851D3c5",
  // test EOA
  [CHAIN_ID.EVMOS_TESTNET]: "0xc4b5B4a43f39cD6e99cc85Fa0672dFa3c1c721AD",
}

export const FRAX_MULTISIG_ADDRESSES = {
  [CHAIN_ID.MAINNET]: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
}

export const PROD_DEPLOYER_ADDRESS =
  "0x5BDb37d0Ddea3A90F233c7B7F6b9394B6b2eef34"
