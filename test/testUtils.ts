import { BytesLike } from "@ethersproject/bytes"
import { Contract } from "@ethersproject/contracts"
import { BigNumber, Bytes, ContractFactory, providers, Signer } from "ethers"
import { ethers, network } from "hardhat"
import { DeploymentsExtension } from "hardhat-deploy/dist/types"
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
  const swapFactory = (await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries),
    signer,
  )) as ContractFactory

  if (args) {
    return swapFactory.deploy(...args)
  } else {
    return swapFactory.deploy()
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

export async function forceAdvanceOneBlock(timestamp?: number): Promise<any> {
  const params = timestamp ? [timestamp] : []
  return ethers.provider.send("evm_mine", params)
}

export async function setTimestamp(timestamp: number): Promise<any> {
  return forceAdvanceOneBlock(timestamp)
}

export async function increaseTimestamp(timestampDelta: number): Promise<any> {
  await ethers.provider.send("evm_increaseTime", [timestampDelta])
  return forceAdvanceOneBlock()
}

export async function setNextTimestamp(timestamp: number): Promise<any> {
  const chainId = (await ethers.provider.getNetwork()).chainId

  switch (chainId) {
    case 31337: // buidler evm
      return ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    case 1337: // ganache
    default:
      return setTimestamp(timestamp)
  }
}

export async function getCurrentBlockTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

export async function impersonateAccount(
  address: string,
): Promise<providers.JsonRpcSigner> {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  })

  return ethers.provider.getSigner(address)
}

export async function setEtherBalance(
  address: string,
  amount: number,
): Promise<any> {
  return ethers.provider.send("hardhat_setBalance", [
    address,
    `0x${amount.toString(16)}`,
  ])
}

export async function asyncForEach<T>(
  array: Array<T>,
  callback: (item: T, index: number) => void,
): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index)
  }
}
