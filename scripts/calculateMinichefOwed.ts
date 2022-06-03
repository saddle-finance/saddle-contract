import { ethers, deployments, network } from "hardhat"
import { BigNumber } from "ethers"
import fetch from "node-fetch"

interface TimeToRateMap {
  [timestamp: number]: BigNumber
}

async function main() {
  const latestBlockTimestamp = (await ethers.provider.getBlock("latest"))
    .timestamp

  const etherscanAPIUrl = network.verify?.etherscan?.apiUrl
  const etherscanAPIKey = network.verify?.etherscan?.apiKey
  if (!etherscanAPIUrl) {
    throw new Error(
      `No etherscan API URL found in hardhat.config.js file for network ${network.name}`,
    )
  }

  const minichef = await ethers.getContract("MiniChefV2")
  const creationTxHash = (await deployments.get("MiniChefV2"))
    .transactionHash as string
  const creationBlockNumber = (
    await ethers.provider.getTransaction(creationTxHash)
  ).blockNumber as number
  const creationBlockTimestamp = (
    await ethers.provider.getBlock(creationBlockNumber)
  ).timestamp

  const eventFilter = minichef.filters.LogSaddlePerSecond()
  const topic0 = eventFilter.topics ? eventFilter.topics[0] : undefined

  const etherscanQueryURL = `${etherscanAPIUrl}/api?module=logs&action=getLogs&fromBlock=${creationBlockNumber}&toBlock=latest&address=${minichef.address}&topic0=${topic0}&apikey=${etherscanAPIKey}`
  const response = await fetch(etherscanQueryURL)
  if (!response.ok) throw new Error("calculateMinichefOwed: Bad response")
  const json = await response.json()
  if (json.status !== "1") {
    throw new Error(`calculateMinichefOwed: ${json.result}`)
  }

  const allEvents: any[] = json.result
  console.log(`Queried ${allEvents.length} events`)

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
  let cumulativeSaddle = BigNumber.from(0)
  let lastTimestamp = creationBlockTimestamp
  let prevRate = BigNumber.from(0)
  for (const key in timeToRateMap) {
    const now = parseInt(key)
    const rate = timeToRateMap[now]
    console.log(`rate was changed from ${prevRate} to ${rate} @ ${now}`)
    const timeDelta = now - lastTimestamp
    const saddleDelta = prevRate.mul(timeDelta)
    cumulativeSaddle = cumulativeSaddle.add(saddleDelta)
    lastTimestamp = now
    prevRate = rate
  }

  console.log(
    `Cumulative saddle owed to MiniChef on ${
      network.name
    } chain : ${ethers.utils.formatUnits(cumulativeSaddle.toString(), 18)}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
