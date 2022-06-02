import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"
import {
  BIG_NUMBER_1E18,
  impersonateAccount,
  setEtherBalance,
} from "../../test/testUtils"
import { GaugeController, MiniChefV2, Minter, SDL } from "../../build/typechain"
import { timestampToUTCString } from "../../utils/time"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments

  // Contract name constants
  const SDL_CONTRACT_NAME = "SDL"
  const MINTER_CONTRACT_NAME = "Minter"
  const GAUGECONTROLLER_CONTRACT_NAME = "GaugeController"
  const MINICHEFV2_CONTRACT_NAME = "MiniChefV2"

  // Time related constants
  const DAY = 86400
  const WEEK = DAY * 7
  const YEAR = WEEK * 52

  // Multisig account is the account that will be used as ownership admin in vesdl contracts.
  // We will be impersonating this account to unpause vesdl and do other various tasks relating to ownership of Saddle.
  const multisig = MULTISIG_ADDRESSES[CHAIN_ID.MAINNET]
  const multisigSigner = await impersonateAccount(multisig)
  await setEtherBalance(multisig, 1e20)

  // Get all necessary contracts
  const sdl = (await ethers.getContract(SDL_CONTRACT_NAME)) as SDL
  const gaugeController = (await ethers.getContract(
    GAUGECONTROLLER_CONTRACT_NAME,
  )) as GaugeController
  const minter = (await ethers.getContract(MINTER_CONTRACT_NAME)) as Minter
  const minichef = (await ethers.getContract(
    MINICHEFV2_CONTRACT_NAME,
  )) as MiniChefV2

  // First, skip this file if
  // 1. we are not forking mainnet
  // 2. if all contracts are intialized already
  if (process.env.FORK_NETWORK !== "mainnet") {
    log(`Not running on forked mainnet, skipping...`)
    return
  }
  if (!(await sdl.paused())) {
    log(
      `SDL contract is already unpaused. Assuming veSDL related contracts are all initialized and skipping...`,
    )
    return
  }

  /************************ SEQ 1 ************************/
  // SEQ 1 on-chain actions are done by the deploy scripts

  /* SEQ 10000 */
  // Deploy Mainnet Gauge Contracts, VotingEscrow, etc (veSDL stack)
  // Done by deploy scripts

  /* SEQ 11000 */
  // Initialize Mainnet Gauge Contracts (via GaugeController)
  // Done by deploy scripts

  /************************ SEQ 2 ************************/
  // Below calls should be called by the multisig account with apesafe

  /* SEQ 20000 */
  // Enable transfer
  await sdl.connect(multisigSigner).enableTransfer()
  log(`SEQ 20000: SDL is now unpaused`)

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
  log(`SEQ 21100: MiniChef rewards are paused on mainnet`)

  /* SEQ 21200 */
  // Bridge & send SDL to MiniChef on other chains
  // TODO: Calculate how much to send to minichef
  await sdl.connect(multisigSigner).transfer(minichef.address, 0)
  // TODO: Send tokens to other chains
  log(`SEQ 21200: Sent SDL to MiniChef on mainnet`)

  /* SEQ 21300 */
  // Send SDL to Minter contract
  // 60_000_000 over 6 months
  await sdl
    .connect(multisigSigner)
    .transfer(minter.address, BIG_NUMBER_1E18.mul(10_000_000))
  log(`SEQ 21300: Sent SDL to Minter on mainnet`)

  /* SEQ 21400 */
  // Initialize Minter rate and kick off the minter epoch
  // Minter epoch is advanced if possible when new gauges are deployed.
  // If this is the case, we don't need to manually advance the epoch.
  let rewardRate = await minter.rate()

  // Only manually trigger mining parameters if rate is 0 (uninitialized)
  if (rewardRate.eq(0)) {
    await minter.connect(multisigSigner).update_mining_parameters()
  }
  log(`SEQ 21400: Initialized minter and kicked off reward rate epoch.`)

  rewardRate = await minter.rate()
  const formattedWeeklyRate = ethers.utils.formatUnits(
    rewardRate.mul(WEEK).toString(),
    18,
  )
  log(`Weekly SDL distribution rate via Minter: ${formattedWeeklyRate}`)

  // Call checkpoint in case we need to manually advance the epoch
  await gaugeController.checkpoint()

  // Future epoch's timestamp.
  const gaugeStartTime = await gaugeController.time_total()
  const minterStartTime = await minter.start_epoch_time()
  log(
    `GaugeController: The intial weights will kick in @ ${gaugeStartTime} (${timestampToUTCString(gaugeStartTime)})`,
  )
  log(
    `Minter: rate epoch started at @ ${minterStartTime} (${timestampToUTCString(minterStartTime)}). New rates can be applied every 2 weeks from the start timestamp.`,
  )
  log(`All SEQ 2 multisig actions completed! \n`)
}

// Only run this in hardhat
export default func
