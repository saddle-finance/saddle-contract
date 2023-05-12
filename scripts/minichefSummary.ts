import { ethers, network } from "hardhat"
import { MiniChefV2 } from "../build/typechain"
import { logNetworkDetails } from "./utils"

async function main() {
  // Prints out all entries held in the pool registry
  // Specify what data to display in console.table() below.
  // Run with runAll comand to fetch data from all networks.

  // Print network details
  await logNetworkDetails(ethers.provider, network)
  const minichef = (await ethers.getContract("MiniChefV2")) as MiniChefV2
  const poolLegth = await minichef.poolLength()
  type PoolInfo = {
    lpTokenName: string
    accSaddlePerShare: string
    lastRewardTime: string
    allocPoint: string
    rewarder?: string
  }
  let PoolInfos: { [lpToken: string]: Partial<PoolInfo> } = {}
  let lpTokenNames: { [lpTokenAddress: string]: string } = {}
  let rewarders: { [lpToken: string]: string } = {}

  // Get all LPToken deployment jsons
  const fs = require("fs")
  const path = require("path")
  const files = fs.readdirSync(
    path.join(__dirname + "/..", "deployments", network.name),
  )
  // itterate through all LPToken json files in deployments/networkname

  files.forEach((file: any) => {
    if (file != "LPToken.json" && file.includes("LPToken.json")) {
      const fileJson = require(path.join(
        __dirname + "/..",
        "deployments",
        network.name,
        file,
      ))
      const name = file.split(".")[0]
      lpTokenNames[fileJson.address] = name
    }
  })
  for (let i = 1; i < poolLegth.toNumber(); i++) {
    const pool = await minichef.poolInfo(i)
    const lpToken = await minichef.lpToken(i)
    PoolInfos[lpToken] = {
      lpTokenName: lpTokenNames[lpToken],
      accSaddlePerShare: pool.accSaddlePerShare.toString(),
      lastRewardTime: pool.lastRewardTime.toString(),
      allocPoint: pool.allocPoint.toString(),
    }

    if (
      (await minichef.rewarder(i)) !=
      "0x0000000000000000000000000000000000000000"
    ) {
      rewarders[lpTokenNames[lpToken]] = await minichef.rewarder(i)
    }
  }
  // remove lptToken 0xc55E8C79e5A6c3216D4023769559D06fa9A7732e as it is an error
  delete PoolInfos["0xc55E8C79e5A6c3216D4023769559D06fa9A7732e"]
  console.log(`MiniChef info on ${network.name}:`)
  console.log("MiniChef Saddle per second: ", await minichef.saddlePerSecond())
  // specify table columns from above object to display here
  console.table(PoolInfos, [
    "lpTokenName",
    "accSaddlePerShare",
    "lastRewardTime",
    "allocPoint",
  ])
  if (Object.keys(rewarders).length > 0) {
    console.log(`Rewarders on ${network.name}:`)
    console.table(rewarders)
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
