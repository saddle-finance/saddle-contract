import { BytesLike } from "@ethersproject/bytes"
import { Contract } from "@ethersproject/contracts"
import * as helpers from "@nomicfoundation/hardhat-network-helpers"
import chalk from "chalk"
import { BigNumber, Bytes, ContractFactory, providers, Signer } from "ethers"
import { readFile } from "fs/promises"
import { ethers } from "hardhat"
import { DeploymentsExtension } from "hardhat-deploy/dist/types"
import { Deployment } from "hardhat-deploy/types"
import { Artifact } from "hardhat/types"
import { IERC20, Swap } from "../build/typechain/"
import merkleTreeDataTest from "../test/exampleMerkleTree.json"
import { CHAIN_ID } from "../utils/network"

export const MAX_UINT256 = ethers.constants.MaxUint256
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export enum TIME {
  SECONDS = 1,
  DAYS = 86400,
  WEEKS = 604800,
}

export const BIG_NUMBER_1E18 = BigNumber.from(10).pow(18)
export const BIG_NUMBER_ZERO = BigNumber.from(0)

export function isMainnet(networkId: string): boolean {
  return networkId == CHAIN_ID.MAINNET
}

export function isTestNetwork(networkId: string): boolean {
  return (
    networkId == CHAIN_ID.HARDHAT ||
    networkId == CHAIN_ID.ROPSTEN ||
    networkId == CHAIN_ID.KOVAN
  )
}

// DEPLOYMENT helper functions

// Workaround for linking libraries not yet working in buidler-waffle plugin
// https://github.com/nomiclabs/buidler/issues/611
export function linkBytecode(
  artifact: Artifact,
  libraries: Record<string, string>,
): string | Bytes {
  let bytecode = artifact.bytecode

  for (const [, fileReferences] of Object.entries(artifact.linkReferences)) {
    for (const [libName, fixups] of Object.entries(fileReferences)) {
      const addr = libraries[libName]
      if (addr === undefined) {
        continue
      }

      for (const fixup of fixups) {
        bytecode =
          bytecode.substr(0, 2 + fixup.start * 2) +
          addr.substr(2) +
          bytecode.substr(2 + (fixup.start + fixup.length) * 2)
      }
    }
  }

  return bytecode
}

export async function deployContractWithLibraries(
  signer: Signer,
  artifact: Artifact,
  libraries: Record<string, string>,
  args?: Array<unknown>,
): Promise<Contract> {
  const contractFactory = (await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries),
    signer,
  )) as ContractFactory

  if (args) {
    return contractFactory.deploy(...args)
  } else {
    return contractFactory.deploy()
  }
}

export function getTestMerkleRoot(): string {
  return merkleTreeDataTest.merkleRoot
}

export function getTestMerkleAllowedAccounts(): Record<string, any> {
  return merkleTreeDataTest.allowedAccounts
}

export function getTestMerkleProof(address: string): BytesLike[] {
  const ALLOWED_ACCOUNTS: Record<string, any> = getTestMerkleAllowedAccounts()

  if (address in ALLOWED_ACCOUNTS) {
    return ALLOWED_ACCOUNTS[address].proof
  }
  return []
}

export async function getDeployedContractByName(
  deployments: DeploymentsExtension,
  name: string,
): Promise<Contract> {
  const deployment = await deployments.get(name)
  return ethers.getContractAt(deployment.abi, deployment.address)
}

// Contract calls

export async function getPoolBalances(
  swap: Swap,
  numOfTokens: number,
): Promise<BigNumber[]> {
  const balances = []

  for (let i = 0; i < numOfTokens; i++) {
    balances.push(await swap.getTokenBalance(i))
  }
  return balances
}

export async function getUserTokenBalances(
  address: string | Signer,
  tokens: Contract[] | string[],
): Promise<BigNumber[]> {
  const balanceArray = []

  if (address instanceof Signer) {
    address = await address.getAddress()
  }

  for (let token of tokens) {
    if (typeof token == "string") {
      token = await ethers.getContractAt("GenericERC20", token)
    }

    balanceArray.push(await (token as IERC20).balanceOf(address))
  }

  return balanceArray
}

export async function getUserTokenBalance(
  address: string | Signer,
  token: Contract,
): Promise<BigNumber> {
  if (address instanceof Signer) {
    address = await address.getAddress()
  }
  return (token as IERC20).balanceOf(address)
}

// EVM methods
export async function forceAdvanceOneBlock(): Promise<any> {
  return helpers.mine()
}

export async function setTimestamp(timestamp: number): Promise<any> {
  return helpers.time.increaseTo(timestamp)
}

export async function increaseTimestamp(timestampDelta: number): Promise<any> {
  return helpers.time.increase(timestampDelta)
}

export async function setNextTimestamp(timestamp: number): Promise<any> {
  return helpers.time.setNextBlockTimestamp(timestamp)
}

export async function getCurrentBlockTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

export async function impersonateAccount(
  address: string,
): Promise<providers.JsonRpcSigner> {
  await helpers.impersonateAccount(address)
  return ethers.provider.getSigner(address)
}

export async function setEtherBalance(
  address: string,
  amount: BigNumber,
): Promise<any> {
  await helpers.setBalance(address, amount)
}

export async function asyncForEach<T>(
  array: Array<T>,
  callback: (item: T, index: number) => void,
): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index)
  }
}

export function convertGaugeNameToSalt(name: string): string {
  return ethers.utils.keccak256(ethers.utils.formatBytes32String(name))
}

/**
 * Try to find the deployment json with the given deployment name and return the
 * deployment json object. Returns null on error.
 * @param deploymentName Name of the deployment to look up
 * @param networkName Name of the network the deployment belongs to
 * @example
 * getWithNameOrNull("SDL", "mainnet")
 */
export async function getWithNameOrNull(
  deploymentName: string,
  networkName: string,
): Promise<Deployment | null> {
  try {
    return getWithName(deploymentName, networkName)
  } catch (e) {
    console.log(chalk.yellow(e))
    return null
  }
}

/**
 * Try to find the deployment json with the given deployment name and return the
 * deployment json object. Throws on error.
 * @param deploymentName Name of the deployment to look up
 * @param networkName Name of the network the deployment belongs to
 * @example
 * getWithName("SDL", "mainnet")
 */
export async function getWithName(
  deploymentName: string,
  networkName: string,
): Promise<Deployment> {
  const file = await readFile(
    `deployments/${networkName}/${deploymentName}.json`,
    "utf8",
  )
  return JSON.parse(file)
}
