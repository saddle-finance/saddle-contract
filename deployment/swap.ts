import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/Allowlist.json"
import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { Wallet } from "ethers"
import { deployContract } from "ethereum-waffle"
import { deployContractWithLibraries } from "../test/testUtils"
import { ethers } from "@nomiclabs/buidler"

// Test Values
const INITIAL_A_VALUE = 50
const SWAP_FEE = 1e7
const ADMIN_FEE = 5e10
const WITHDRAW_FEE = 5e8
const STABLECOIN_LP_TOKEN_NAME = "Stablecoin LP Token"
const STABLECOIN_LP_TOKEN_SYMBOL = "SLPT"
const BTC_LP_TOKEN_NAME = "BTC LP Token"
const BTC_LP_TOKEN_SYMBOL = "BLPT"

async function deploySwap(): Promise<void> {
  const signers = await ethers.getSigners()

  const owner = signers[0]
  const user1 = signers[1]
  const user2 = signers[2]

  const ownerAddress = await owner.getAddress()
  const user1Address = await user1.getAddress()
  const user2Address = await user2.getAddress()
  const addresses = [ownerAddress, user1Address, user2Address]

  // Deploy dummy tokens
  const daiToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "Dai",
    "DAI",
    "18",
  ])) as LpToken

  const usdcToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "USDC Coin",
    "USDC",
    "6",
  ])) as LpToken

  const usdtToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "Tether",
    "USDT",
    "6",
  ])) as LpToken

  const susdToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "sUSD",
    "SUSD",
    "18",
  ])) as LpToken

  const tbtcToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "tBTC",
    "TBTC",
    "18",
  ])) as LpToken

  const wbtcToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "Wrapped Bitcoin",
    "WBTC",
    "8",
  ])) as LpToken

  const renbtcToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "renBTC",
    "RENBTC",
    "8",
  ])) as LpToken

  const sbtcToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
    "sBTC",
    "SBTC",
    "18",
  ])) as LpToken

  const tokens = [
    daiToken,
    usdcToken,
    usdtToken,
    susdToken,
    tbtcToken,
    wbtcToken,
    renbtcToken,
    sbtcToken,
  ]

  console.table(
    await Promise.all(tokens.map(async (t) => [await t.symbol(), t.address])),
  )

  addresses.forEach(async (address) => {
    tokens.forEach(async (token) => {
      await token.mint(address, String(1e20))
    })
  })

  // Deploy Allowlist
  const allowlist = (await deployContract(
    signers[0] as Wallet,
    AllowlistArtifact,
  )) as Allowlist

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
  const stablecoinSwap = (await deployContractWithLibraries(
    owner,
    SwapArtifact,
    { SwapUtils: swapUtils.address },
    [
      [
        daiToken.address,
        usdcToken.address,
        usdtToken.address,
        susdToken.address,
      ],
      [String(1e18), String(1e6), String(1e6), String(1e18)],
      STABLECOIN_LP_TOKEN_NAME,
      STABLECOIN_LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      ADMIN_FEE,
      WITHDRAW_FEE,
      allowlist.address,
    ],
  )) as Swap
  const btcSwap = (await deployContractWithLibraries(
    owner,
    SwapArtifact,
    { SwapUtils: swapUtils.address },
    [
      [
        tbtcToken.address,
        wbtcToken.address,
        renbtcToken.address,
        sbtcToken.address,
      ],
      [String(1e18), String(1e8), String(1e8), String(1e18)],
      BTC_LP_TOKEN_NAME,
      BTC_LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      ADMIN_FEE,
      WITHDRAW_FEE,
      allowlist.address,
    ],
  )) as Swap

  await stablecoinSwap.deployed()
  await btcSwap.deployed()

  console.log(`Stablecoin swap address: ${stablecoinSwap.address}`)
  console.log(`Tokenized BTC swap address: ${btcSwap.address}`)
}

deploySwap().then(() => {
  console.log("Successfully deployed contracts locally...")
})
