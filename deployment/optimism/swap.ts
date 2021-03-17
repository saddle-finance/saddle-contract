import { asyncForEach, deployContractWithLibraries } from "../../test/testUtils"

import { Allowlist } from "../../build/typechain/Allowlist"
import AllowlistArtifact from "../../build/artifacts/contracts/Allowlist.sol/Allowlist-ovm.json"
import { BigNumber } from "@ethersproject/bignumber"
import { GenericERC20 } from "../../build/typechain/GenericErc20"
import GenericERC20Artifact from "../../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20-ovm.json"
import { MathUtils } from "../../build/typechain/MathUtils"
import MathUtilsArtifact from "../../build/artifacts/contracts/MathUtils.sol/MathUtils-ovm.json"
import { Swap } from "../../build/typechain/Swap"
import SwapArtifact from "../../build/artifacts/contracts/Swap.sol/Swap-ovm.json"
import { SwapUtils } from "../../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../../build/artifacts/contracts/SwapUtils.sol/SwapUtils-ovm.json"
import { Wallet } from "ethers"
import { deployContract } from "ethereum-waffle"
import { ethers } from "hardhat"
import merkleTreeData from "../../test/exampleMerkleTree.json"

// Test Values
const INITIAL_A_VALUE = 50
const SWAP_FEE = 1e7
const ADMIN_FEE = 0
const WITHDRAW_FEE = 5e7
const BTC_LP_TOKEN_NAME = "BTC LP Token"
const BTC_LP_TOKEN_SYMBOL = "BLPT"

async function deploySwap(): Promise<void> {
  console.log("Starting OVM swap deployment...")

  const signers = await ethers.getSigners()
  const owner = signers[0]
  const ownerAddress = await owner.getAddress()
  const addresses = [ownerAddress]

  // Deploy dummy tokens
  const tbtcToken = (await deployContract(
    (owner as unknown) as Wallet,
    GenericERC20Artifact,
    ["tBTC", "TBTC", "18"],
  )) as GenericERC20
  await tbtcToken.deployed()
  console.log(" > Deployed tBTC")

  const wbtcToken = (await deployContract(
    (owner as unknown) as Wallet,
    GenericERC20Artifact,
    ["Wrapped Bitcoin", "WBTC", "8"],
  )) as GenericERC20
  await wbtcToken.deployed()
  console.log(" > Deployed WBTC")

  const renbtcToken = (await deployContract(
    (owner as unknown) as Wallet,
    GenericERC20Artifact,
    ["renBTC", "RENBTC", "8"],
  )) as GenericERC20
  await renbtcToken.deployed()
  console.log(" > Deployed renBTC")

  const sbtcToken = (await deployContract(
    (owner as unknown) as Wallet,
    GenericERC20Artifact,
    ["sBTC", "SBTC", "18"],
  )) as GenericERC20
  await sbtcToken.deployed()
  console.log(" > Deployed sBTC")
  console.log(
    "deployed bytecode:",
    await ethers.provider.getCode(sbtcToken.address),
  )

  const tokens = [tbtcToken, wbtcToken, renbtcToken, sbtcToken]

  console.table(
    await Promise.all(tokens.map(async (t) => [await t.symbol(), t.address])),
  )

  await asyncForEach(addresses, async (address) => {
    await asyncForEach(tokens, async (token) => {
      const decimals = await token.decimals()
      // Stringifying numbers over 1e20 breaks BigNumber, so get creative
      const amount = "1" + new Array(decimals + 5).fill(0).join("")
      await token.mint(address, amount)
      await token.mint("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount)
    })
  })
  console.log(" > Minted tokens")

  // Deploy Allowlist
  const allowlist = (await deployContract(
    (signers[0] as unknown) as Wallet,
    AllowlistArtifact,
    [merkleTreeData.merkleRoot],
  )) as Allowlist
  await allowlist.deployed()
  console.log(" > Deployed Allowlist")
  console.log(
    "deployed bytecode:",
    await ethers.provider.getCode(allowlist.address),
  )

  // Deploy MathUtils
  const mathUtils = (await deployContract(
    (signers[0] as unknown) as Wallet,
    MathUtilsArtifact,
  )) as MathUtils
  await mathUtils.deployed()
  console.log(` > Deployed MathUtils: ${mathUtils.address}`)
  console.log(
    "deployed bytecode:",
    await ethers.provider.getCode(mathUtils.address),
  )

  // Deploy SwapUtils with MathUtils library
  const swapUtils = (await deployContractWithLibraries(
    owner,
    SwapUtilsArtifact,
    {
      "MathUtils-ovm": mathUtils.address,
    },
  )) as SwapUtils
  await swapUtils.deployed()
  console.log(` > Deployed SwapUtils: ${swapUtils.address}`)
  console.log(
    "deployed bytecode:",
    await ethers.provider.getCode(swapUtils.address),
  )

  // Deploy Swap with SwapUtils library
  const btcSwap = (await deployContractWithLibraries(
    owner,
    SwapArtifact,
    { "SwapUtils-ovm": swapUtils.address },
    [
      [
        tbtcToken.address,
        wbtcToken.address,
        renbtcToken.address,
        sbtcToken.address,
      ],
      [18, 8, 8, 18],
      BTC_LP_TOKEN_NAME,
      BTC_LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      ADMIN_FEE,
      WITHDRAW_FEE,
      allowlist.address,
    ],
  )) as Swap
  await btcSwap.deployed()
  console.log(" > Deployed Swap")
  console.log(
    "deployed bytecode:",
    await ethers.provider.getCode(btcSwap.address),
  )

  // Disable guard
  // await btcSwap.disableGuard()
  // console.log(" > Disabled guard")

  console.log(`Tokenized BTC swap address: ${btcSwap.address}`)

  const btcLpToken = (await btcSwap.swapStorage()).lpToken
  console.log(`Tokenized BTC swap token address: ${btcLpToken}`)
}

deploySwap().then(() => {
  console.log("Successfully deployed contracts locally...")
})
