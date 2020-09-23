import { ethers } from "@nomiclabs/buidler"
import { deployContract } from "ethereum-waffle"
import { Wallet } from "ethers"
import { deployContractWithLibraries } from "../test/testUtils"

import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { SwapUtils } from "../build/typechain/SwapUtils"

import SwapArtifact from "../build/artifacts/Swap.json"
import { Swap } from "../build/typechain/Swap"

import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

// Test Values
const INITIAL_A_VALUE = 50
const SWAP_FEE = 1e7
const LP_TOKEN_NAME = "Test LP Token Name"
const LP_TOKEN_SYMBOL = "TESTLP"

async function deploySwap(): Promise<string> {
  const signers = await ethers.getSigners()
  const owner = signers[0]
  const user1 = signers[1]
  const user2 = signers[2]

  // Deploy dummy tokens
  const firstToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "First Token",
    "FIRST",
    "18",
  ])) as LpToken

  console.log(`First Token: ${firstToken.address}`)

  const secondToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "Second Token",
    "SECOND",
    "18",
  ])) as LpToken

  console.log(`Second Token: ${secondToken.address}`)

  // Mint dummy tokens
  await firstToken.mint(await owner.getAddress(), String(1e20))
  await secondToken.mint(await owner.getAddress(), String(1e20))

  await firstToken.mint(await user1.getAddress(), String(1e20))
  await secondToken.mint(await user1.getAddress(), String(1e20))

  await firstToken.mint(await user2.getAddress(), String(1e20))
  await secondToken.mint(await user2.getAddress(), String(1e20))

  // Deploy MathUtils
  const mathUtils = (await deployContract(
    signers[0] as Wallet,
    MathUtilsArtifact,
  )) as MathUtils

  // Deploy SwapUtils with MathUtils library
  const swapUtils = (await deployContractWithLibraries(
    owner,
    SwapUtilsArtifact,
    {
      MathUtils: mathUtils.address,
    },
  )) as SwapUtils
  await swapUtils.deployed()

  // Deploy Swap with SwapUtils library
  const swap = (await deployContractWithLibraries(
    owner,
    SwapArtifact,
    { SwapUtils: swapUtils.address },
    [
      [firstToken.address, secondToken.address],
      [String(1e18), String(1e18)],
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
    ],
  )) as Swap

  await swap.deployed()
  return swap.address
}

deploySwap().then((swapAddress) => console.log(`Swap :${swapAddress}`))
