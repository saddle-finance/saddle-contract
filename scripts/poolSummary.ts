import { ethers, network } from "hardhat"
import {
  LPToken,
  PoolRegistry,
  MasterRegistry,
  Minter,
  VotingEscrow,
  SDL,
  FeeDistributor,
} from "../build/typechain"
import { convertDeploymentsToSimpleAddressMap } from "../tasks/utils"
import { CHAIN_ID } from "../utils/network"
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
  const lastpool = await poolRegistry.getPoolDataAtIndex(poolRegLegnth - 1)
  console.log(lastpool)
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
