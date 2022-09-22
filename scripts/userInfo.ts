import { ethers, network } from "hardhat"
import { MiniChefV2 } from "../build/typechain"
import { ZERO_ADDRESS } from "../test/testUtils"
import { logNetworkDetails } from "./utils"

async function getRewarderInfo(rewarderAddress: string, userAddress: string) {
  console.log("getting rewarder info")
  const rewarder = await ethers.getContractAt("SimpleRewarder", rewarderAddress)
  const rewarderInfo = await rewarder.pendingTokens(0, userAddress, 0)
  console.log(rewarderInfo)
  return rewarderInfo[1][0].toString()
}

async function minichefRewardsClaimable(userAddress: string) {
  // Get Reward Info from Minichef
  const minichef = (await ethers.getContract("MiniChefV2")) as MiniChefV2
  const poolLegth = await minichef.poolLength()
  type pendingRewards = {
    lpTokenName: string
    pendingSDL: string
    pendingRewards: string
  }
  // lpToken -> PoolInfo
  let userMinichefRewardsInfos: { [lpToken: string]: Partial<pendingRewards> } =
    {}
  // lpTokenAddress -> name
  let lpTokenNames: { [lpTokenAddress: string]: string } = {}
  // Liquidity Gauge Addr -> name
  let liquidityGaugeNames: { [liquidityGaugeAddress: string]: string } = {}
  // all lpToken addresses found in deployments folder
  let lpTokenAddresses: string[] = []
  // all liquidity gauge addresses found in deployments folder
  let liquidityGaugeAddresses: string[] = []
  // lpTokenAddress -> rewarder address
  let rewarders: { [lpToken: string]: string } = {}

  // Get all LPToken deployment jsons
  const fs = require("fs")
  const path = require("path")
  const files = fs.readdirSync(
    path.join(__dirname + "/..", "deployments", network.name),
  )
  // itterate through all LPToken json files in deployments/networkname

  files.forEach((file: any) => {
    if (
      file != "LPToken.json" &&
      file.includes("LPToken.json") &&
      !file.includes("LiquidityGaugeV5") &&
      !file.includes("SimpleRewarder")
    ) {
      const fileJson = require(path.join(
        __dirname + "/..",
        "deployments",
        network.name,
        file,
      ))
      const name = file.split(".")[0]
      lpTokenAddresses.push(fileJson.address)
      lpTokenNames[fileJson.address] = name
    }
    if (file.includes("LiquidityGaugeV5")) {
      const fileJson = require(path.join(
        __dirname + "/..",
        "deployments",
        network.name,
        file,
      ))
      const name = file.split(".")[0]
      liquidityGaugeAddresses.push(fileJson.address)
      liquidityGaugeNames[fileJson.address] = name
    }
  })
  // log users lpToken balances
  for (let i in lpTokenAddresses) {
    const lpTokenAddress = lpTokenAddresses[i]
    const lpTokenName = lpTokenNames[lpTokenAddress]
    const lpTokenContract = await ethers.getContractAt(
      "LPToken",
      lpTokenAddress,
    )
    const userBalance = await lpTokenContract.balanceOf(userAddress)
    console.log(`${lpTokenName} at ${lpTokenAddress} balance: ${userBalance}`)
  }
  // log users gauge balances
  for (let i in liquidityGaugeAddresses) {
    const liquidityGaugeAddress = liquidityGaugeAddresses[i]
    const liquidityGaugeName = liquidityGaugeNames[liquidityGaugeAddress]
    const liquidityGaugeContract = await ethers.getContractAt(
      "LiquidityGaugeV5",
      liquidityGaugeAddress,
    )
    const userBalance = await liquidityGaugeContract.balanceOf(userAddress)
    console.log(
      `${liquidityGaugeName} at ${liquidityGaugeAddress} balance: ${userBalance}`,
    )
  }
  // itterate through all pools in minichef
  for (let i = 1; i < poolLegth.toNumber(); i++) {
    const pool = await minichef.poolInfo(i)
    console.log(pool)
    const lpToken = await minichef.lpToken(i)
    const rewarder = await minichef.rewarder(i)
    console.log(`pid[${i}] lpToken: ${lpToken} rewarder: ${rewarder}`)
    userMinichefRewardsInfos[lpToken] = {
      lpTokenName: lpTokenNames[lpToken],
      pendingSDL: (await minichef.pendingSaddle(i, userAddress)).toString(),
      pendingRewards:
        rewarder == ZERO_ADDRESS
          ? "0"
          : await getRewarderInfo(rewarder, userAddress),
    }
    console.log(userMinichefRewardsInfos[lpToken])
  }
}

async function main(userAddress: string) {
  // Log network Details
  await logNetworkDetails(ethers.provider, network)
  await minichefRewardsClaimable(userAddress)
}
main("0x92703b74131dABA21d78eabFEf1156C7ffe81dE0")
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
