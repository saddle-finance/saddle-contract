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
  const poolReg = await ethers.getContract("PoolRegistry")
  console.log(await poolReg.getPoolDataAtIndex(1))

  // const poolRegistry = (await ethers.getContract(
  //   "PoolRegistry",
  // )) as PoolRegistry

  // const sdl = (await ethers.getContract("SDL")) as SDL
  // const veSDL = (await ethers.getContract("VotingEscrow")) as VotingEscrow
  // const minter = (await ethers.getContract("Minter")) as Minter
  // const feeDistributor = (await ethers.getContract(
  //   "FeeDistributor",
  // )) as FeeDistributor

  // // get all pools from pool registry
  // let poolRegLegnth: number = (await poolRegistry.getPoolsLength()).toNumber()
  // const lastpool = await poolRegistry.getPoolDataAtIndex(poolRegLegnth - 1)
  // console.log(lastpool)
  // const DAY = 86400
  // const WEEK = 86400 * 7
  // const YEAR = WEEK * 52
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
