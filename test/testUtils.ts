import { BigNumber, Bytes, ContractFactory, Signer } from "ethers"
import { Contract } from "@ethersproject/contracts"
import { Artifact } from "hardhat/types"
import { ethers } from "hardhat"

import { Erc20 as ERC20 } from "../build/typechain/Erc20"

export const MAX_UINT256 = ethers.constants.MaxUint256

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

export async function getTokenBalances(
  address: string | Signer,
  ...tokens: ERC20[]
): Promise<BigNumber[]> {
  const balanceArray = []

  if (address instanceof Signer) {
    address = await address.getAddress()
  }

  for (const token of tokens) {
    balanceArray.push(await token.balanceOf(address))
  }

  return balanceArray
}

export async function getTokenBalance(
  address: string | Signer,
  token: ERC20,
): Promise<BigNumber> {
  if (address instanceof Signer) {
    address = await address.getAddress()
  }
  return token.balanceOf(address)
}

export async function setNextTimestamp(timestamp: number): Promise<any> {
  const chainId = (await ethers.provider.getNetwork()).chainId

  switch (chainId) {
    case 31337: // buidler evm
      return ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    case 1337: // ganache
    default:
      return ethers.provider.send("evm_mine", [timestamp])
  }
}

export async function setTimestamp(timestamp: number): Promise<any> {
  return ethers.provider.send("evm_mine", [timestamp])
}

export async function getCurrentBlockTimestamp(): Promise<number> {
  return (
    await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
  ).timestamp
}

export async function asyncForEach<T>(
  array: Array<T>,
  callback: (item: T, index: number) => void,
): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index)
  }
}
