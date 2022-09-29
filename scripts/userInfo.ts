import { config, ethers, getChainId, network } from "hardhat"
import { MiniChefV2 } from "../build/typechain"
import { getCurrentBlockTimestamp, ZERO_ADDRESS } from "../test/testUtils"
import { getNetworkNameFromChainId } from "../utils/network"
import { logNetworkDetails } from "./utils"

async function eventQuery(event: string) {
  const chainId = await getChainId()
  const networkConfig = config.networks[getNetworkNameFromChainId(chainId)]
  const etherscanAPIUrl = networkConfig.verify?.etherscan?.apiUrl
  const etherscanAPIKey = networkConfig.verify?.etherscan?.apiKey
  if (!etherscanAPIUrl) {
    throw new Error(
      `No etherscan API URL found in hardhat.config.js file for network ${network.name}`,
    )
  }

  const minichef = (await ethers.getContract("MiniChefV2")) as MiniChefV2
  const creationTxHash = (await deployments.get("MiniChefV2"))
    .transactionHash as string
  const creationBlockNumber = (
    await ethers.provider.getTransaction(creationTxHash)
  ).blockNumber as number
  const creationBlockTimestamp = (
    await ethers.provider.getBlock(creationBlockNumber)
  ).timestamp

  // Check current Saddle per second rate
  const currentSaddleRate = await minichef.saddlePerSecond()
  if (currentSaddleRate.gt(0)) {
    console.warn(
      "\x1b[33m%s\x1b[0m",
      `Saddle per second is not 0. It is ${currentSaddleRate}`,
    )
    console.warn(
      "\x1b[33m%s\x1b[0m",
      `For the purposes of the calculation, this script will assume it is changed to 0 at current block (${latestBlock.number})`,
    )
  }

  // Create event filter
  const eventFilter = minichef.filters.LogSaddlePerSecond()
  const topic0 = eventFilter.topics ? eventFilter.topics[0] : undefined

  // Use etherscan API to get all events matching the filter
  const etherscanQueryURL = `${etherscanAPIUrl}/api?module=logs&action=getLogs&fromBlock=${creationBlockNumber}&toBlock=latest&address=${minichef.address}&topic0=${topic0}&apikey=${etherscanAPIKey}`
  const response = await fetch(etherscanQueryURL)
  if (!response.ok) throw new Error("calculateMinichefOwed: Bad response")
  const json = await response.json()
  if (json.status !== "1") {
    throw new Error(`calculateMinichefOwed: ${json.result}`)
  }

  const allEvents: any[] = json.result
  console.log(`Queried ${allEvents.length} LogSaddlePerSecond events`)
}

async function votingEscrowInfo(userAddress: string) {
  const ve = await ethers.getContract("VotingEscrow")
  const velocked = await ve.locked(userAddress)
  console.log("ve.locked.amount: ", velocked["amount"].toString())
  console.log("ve.locked.deadline: ", velocked["end"].toString())
  console.log(
    "currnet block timestamp: ",
    (await getCurrentBlockTimestamp()).toString(),
  )
}

async function gaugeRewardsClaimable(userAddress: string) {
  // Liquidity Gauge Addr -> name
  let liquidityGaugeNames: { [liquidityGaugeAddress: string]: string } = {}
  // all liquidity gauge addresses found in deployments folder
  let liquidityGaugeAddresses: string[] = []

  // Get all LPToken deployment jsons
  const fs = require("fs")
  const path = require("path")
  const files = fs.readdirSync(
    path.join(__dirname + "/..", "deployments", network.name),
  )
  // itterate through all LiquidityGaugeV5 json files in deployments/networkname

  files.forEach((file: any) => {
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
    // below should only be called on forked network as its a write call
    console.log(
      "claimable_reward",
      await liquidityGaugeContract.claimable_tokens(userAddress),
    )
    console.log(
      "claimable_reward: ",
      (
        await liquidityGaugeContract.claimable_reward(
          userAddress,
          await liquidityGaugeContract.sdl_token(),
        )
      ).toString(),
    )
    console.log(
      "claimed_reward: ",
      (
        await liquidityGaugeContract.claimed_reward(
          userAddress,
          await liquidityGaugeContract.sdl_token(),
        )
      ).toString(),
    )
    // TODO: below fails
    // console.log(
    //   "adjusted_balance_of: ",
    //   await liquidityGaugeContract.adjusted_balance_of(userAddress),
    // )
  }
}

async function getRewarderInfo(rewarderAddress: string, userAddress: string) {
  console.log("getting rewarder info")
  const rewarder = await ethers.getContractAt("SimpleRewarder", rewarderAddress)
  const rewarderInfo = await rewarder.pendingTokens(0, userAddress, 0)
  console.log(rewarderInfo)
  return [rewarderInfo[0][0].toString(), rewarderInfo[1][0].toString()]
}

async function minichefRewardsClaimable(userAddress: string) {
  // Get Reward Info from Minichef
  const minichef = (await ethers.getContract("MiniChefV2")) as MiniChefV2
  const poolLegth = await minichef.poolLength()
  type pendingRewards = {
    lpTokenName: string
    pendingSDL: string
    pendingRewards?: string
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
  //   await minichefRewardsClaimable(userAddress)
  await gaugeRewardsClaimable(userAddress)
  //   await votingEscrowInfo(userAddress)
}
main("0x92703b74131dABA21d78eabFEf1156C7ffe81dE0")
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
