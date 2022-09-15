import { ethers, network } from "hardhat"
import { PoolRegistry } from "../build/typechain"
import { logNetworkDetails } from "./utils"

async function main() {
  // Print network details
  await logNetworkDetails(ethers.provider, network)

  // const signers = await ethers.getSigners()
  const poolRegistry = (await ethers.getContract(
    "PoolRegistry",
  )) as PoolRegistry

  // get all pools from pool registry
  let poolRegLegnth: number = (await poolRegistry.getPoolsLength()).toNumber()
  // let poolEntries: { [poolname: string]: IPoolRegistry.PoolDataStructOutput } =
  //   {}
  let poolEntries: { [poolname: string]: any } = {}
  for (let pid = 0; pid < poolRegLegnth; pid++) {
    const entry = await poolRegistry.getPoolDataAtIndex(pid)
    const poolName = ethers.utils.parseBytes32String(entry.poolName)
    poolEntries[poolName] = {
      poolAddress: entry.poolAddress,
      lptokenAddress: entry.lpToken,
      typeOfAsset: entry.typeOfAsset,
      poolName: poolName,
      targetAddress: entry.targetAddress,
      tokens: entry.tokens,
      underlyingTokens: entry.underlyingTokens,
      basePoolAddress: entry.basePoolAddress,
      metaSwapDepositAddress: entry.metaSwapDepositAddress,
      isSaddleApproved: entry.isSaddleApproved,
      isRemoved: entry.isRemoved,
      isGuarded: entry.isGuarded,
    }
  }
  console.log(`Pool Registry Entries on ${network.name}:`)
  // specify table columns from above object to display here
  console.table(poolEntries, ["poolAddress", "lptokenAddress"])
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
