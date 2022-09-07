import { ethers, deployments, network, getChainId, config } from "hardhat"
import { BigNumber } from "ethers"
import fetch from "node-fetch"
import { MiniChefV2, SDL } from "../build/typechain"
import { getNetworkNameFromChainId } from "../utils/network"

interface TimeToRateMap {
  [timestamp: number]: BigNumber
}

async function main() {
  const latestBlock = await ethers.provider.getBlock("latest")
  const latestBlockTimestamp = latestBlock.timestamp
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

  // Calculate the time to rate map
  const timeToRateMap: TimeToRateMap = {}
  for (const e of allEvents) {
    const timestamp = BigNumber.from(e.timeStamp).toNumber()
    const saddlePerSecond = BigNumber.from(e.data)
    timeToRateMap[timestamp] = saddlePerSecond
  }
  // Assume the rate is turned off at the latest block timestamp
  timeToRateMap[latestBlockTimestamp] = BigNumber.from(0)

  // Calculate cumulative saddle by multiplying the time delta by the rate
  let cumulativeSaddleRequired = BigNumber.from(0)
  let lastTimestamp = creationBlockTimestamp
  let prevRate = BigNumber.from(0)
  for (const key in timeToRateMap) {
    const now = parseInt(key)
    const rate = timeToRateMap[now]
    console.log(`rate was changed from ${prevRate} to ${rate} @ ${now}`)
    const timeDelta = now - lastTimestamp
    const saddleDelta = prevRate.mul(timeDelta)
    cumulativeSaddleRequired = cumulativeSaddleRequired.add(saddleDelta)
    lastTimestamp = now
    prevRate = rate
  }

  // Get SDL contract on this chain
  const sdl = (await ethers.getContract("SDL")) as SDL

  // Get transfer event filter
  const transferEventFilter = sdl.filters.Transfer(undefined, minichef.address)
  const transferTopic0 = transferEventFilter.topics
    ? transferEventFilter.topics[0]
    : undefined
  const transferTopic2 = transferEventFilter.topics
    ? transferEventFilter.topics[2]
    : undefined

  // Use etherscan API to get all events matching the filter
  const etherscanSDLTransferQueryURL = `${etherscanAPIUrl}/api?module=logs&action=getLogs&fromBlock=${creationBlockNumber}&toBlock=latest&address=${sdl.address}&topic0=${transferTopic0}&topic2=${transferTopic2}&topic0_2_opr=and&apikey=${etherscanAPIKey}`
  const sdlTransferResponse = await fetch(etherscanSDLTransferQueryURL)
  if (!sdlTransferResponse.ok)
    throw new Error("calculateMinichefOwed: Bad response")
  const sdlTransferJson = await sdlTransferResponse.json()
  if (sdlTransferJson.status !== "1") {
    if (sdlTransferJson.status === "0" && sdlTransferJson.result.length === 0) {
      console.warn(
        "\x1b[33m%s\x1b[0m",
        `No event logs were found for ${sdl.address}`,
      )
    } else throw new Error(`calculateMinichefOwed: ${sdlTransferJson.result}`)
  }

  const allTransferEvents: any[] = sdlTransferJson.result
  console.log(
    `Queried ${allTransferEvents.length} SDL Transfer events to minichef`,
  )

  // Calculate cumulative SDL sent to minichef
  let cumulativeSDLSent = BigNumber.from(0)
  for (const e of allTransferEvents) {
    const amount = BigNumber.from(e.data)
    cumulativeSDLSent = cumulativeSDLSent.add(amount)
  }

  // Print cumulative SDL required by minichef
  console.log(
    `Cumulative SDL required by MiniChef on ${
      network.name
    } chain : ${ethers.utils.formatUnits(
      cumulativeSaddleRequired.toString(),
      18,
    )}`,
  )

  // Print cumulative SDL sent to minichef
  console.log(
    `Cumulative SDL sent to MiniChef on ${
      network.name
    } chain : ${ethers.utils.formatUnits(cumulativeSDLSent.toString(), 18)}`,
  )

  // Print total SDL owed by minichef
  const totalSDLOwed = cumulativeSaddleRequired.gte(cumulativeSDLSent)
    ? cumulativeSaddleRequired.sub(cumulativeSDLSent)
    : BigNumber.from(0)
  console.log(
    `Total SDL owed by MiniChef on ${
      network.name
    } chain : ${ethers.utils.formatUnits(totalSDLOwed.toString(), 18)}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
