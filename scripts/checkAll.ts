import {
  BIG_NUMBER_1E18,
  MAX_UINT256,
  asyncForEach,
  getCurrentBlockTimestamp,
  increaseTimestamp,
  setTimestamp,
  impersonateAccount,
  setEtherBalance,
} from "../test/testUtils"
import {
  FeeDistributor,
  LPToken,
  MiniChefV2,
  Minter,
  SDL,
  Swap,
  VotingEscrow,
} from "../build/typechain"

import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"
import { MULTISIG_ADDRESSES, PROD_DEPLOYER_ADDRESS } from "../utils/accounts"
import { CHAIN_ID } from "../utils/network"

const { expect } = chai

chai.use(solidity)

const SDL_CONTRACT_NAME = "SDL"
const VOTINGESCROW_CONTRACT_NAME = "VotingEscrow"
const MINTER_CONTRACT_NAME = "Minter"
const FEEDISTRIBUTOR_CONTRACT_NAME = "FeeDistributor"

// Time related constants
const DAY = 86400
const WEEK = 86400 * 7
const YEAR = WEEK * 52

async function main() {
  // Set up all necessary accounts

  // Deployer account is the account that will be used as operational admin
  const deployer = PROD_DEPLOYER_ADDRESS
  const deployerSigner = await impersonateAccount(deployer)

  // Multisig account is the account that will be used as ownership admin in vesdl contracts.
  // We will be impersonating this account to unpause vesdl and do other various tasks relating to ownership of Saddle.
  const multisig = MULTISIG_ADDRESSES[CHAIN_ID.MAINNET]
  const multisigSigner = await impersonateAccount(multisig)
  await setEtherBalance(multisig, 1e20)

  // Get all necessary contracts
  const sdl = (await ethers.getContract(SDL_CONTRACT_NAME)) as SDL
  const veSDL = (await ethers.getContract(
    VOTINGESCROW_CONTRACT_NAME,
  )) as VotingEscrow
  const minter = (await ethers.getContract(MINTER_CONTRACT_NAME)) as Minter
  const feeDistributor = (await ethers.getContract(
    FEEDISTRIBUTOR_CONTRACT_NAME,
  )) as FeeDistributor
  const minichef = (await ethers.getContract("MiniChefV2")) as MiniChefV2

  /* SEQ 10000 */
  // Deploy Mainnet Gauge Contracts, VotingEscrow, etc (veSDL stack)
  // Done by our deploy scripts

  /* SEQ 11000 */
  // Initialize Mainnet Gauge Contracts (via GaugeController)
  // Done by deploy scripts

  /************************ SEQ 2 ************************/
  // Below calls should be called by the multisig account with apesafe

  /* SEQ 20000 */
  // Enable transfer
  await sdl.connect(multisigSigner).enableTransfer()
  console.log(`SEQ 20000: SDL is unpaused`)

  /* SEQ 21100 */
  // Pause MiniChef rewards on mainnet
  await minichef.connect(multisigSigner).setSaddlePerSecond(0)
  const poolLength = (await minichef.poolLength()).toNumber()
  const batchCall = [
    // Set saddlePerSecond to 0
    await minichef.populateTransaction.setSaddlePerSecond(0),
    // Mass update pools to ensure 0 sdl per second is set for each PID.
    await minichef.populateTransaction.massUpdatePools(
      Array(poolLength - 1)
        .fill(null)
        .map((_, i) => i + 1),
    ),
  ]
  const batchCallData = batchCall.map((x) => x.data).filter(Boolean) as string[]
  await minichef.connect(multisigSigner).batch(batchCallData, true)
  console.log(`SEQ 21100: MiniChef rewards are paused on mainnet`)

  /* SEQ 21200 */
  // Bridge & send SDL to MiniChef on other chains
  // TODO: Calculate how much to send to minichef
  await sdl.connect(multisigSigner).transfer(minichef.address, 0)

  /* SEQ 21300 */
  // Send SDL to Minter contract
  await sdl.connect(multisigSigner).transfer(minter.address, BIG_NUMBER_1E18.mul(60_000_000))

  /* SEQ 21400 */
  // Initialize Minter rate and kick off the mining epoch
  await minter.connect(multisigSigner).commit_next_emission(BIG_NUMBER_1E18.mul(2_500_000))
  await minter.connect(multisigSigner).update_mining_parameters()

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
