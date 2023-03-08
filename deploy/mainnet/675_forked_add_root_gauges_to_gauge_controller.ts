import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { getCurrentBlockTimestamp, setEtherBalance } from "../../test/testUtils"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { WEEK } from "../../utils/time"

/*
 * Script for Forked Mainnet
 * Impersonate multisig account to add root gauges to GaugeController
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, save, all, read } = deployments

  // Skip this script if not running on forked mode
  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  // Set execution options to use multisig account
  const executeOptions = {
    log: true,
    from: MULTISIG_ADDRESSES[1],
  }

  // Set multisig balance to non-zero for sending direct txs
  await setEtherBalance(MULTISIG_ADDRESSES[1], ethers.utils.parseEther("1000"))

  // Find all root gauges' addresses
  const rootGaugeAddresses = await all().then((deployments) =>
    Object.keys(deployments)
      .filter((deploymentName) => deploymentName.includes("RootGauge_"))
      .map((deploymentName) => {
        const address = deployments[deploymentName].address
        console.log(`"${deploymentName}" : "${address}",`)
        return address
      }),
  )

  // For each root gauge address, add it to the GaugeController from multisig
  // with weight of 100 for testing purposes
  for (const rootGauge of rootGaugeAddresses) {
    await execute(
      "GaugeController",
      executeOptions,
      "add_gauge(address,int128,uint256)",
      rootGauge,
      0,
      ethers.utils.parseEther("1000000"),
    )
  }

  // Sanity check weights for next week by only reading from GaugeController
  const currentBlockTimestamp = await getCurrentBlockTimestamp()
  const startOfNextWeek = Math.floor(currentBlockTimestamp / WEEK) * WEEK + WEEK
  const numOfGauges = await read("GaugeController", "n_gauges")

  for (let i = 0; i < numOfGauges; i++) {
    const gaugeAddress = await read("GaugeController", "gauges", i)
    const relativeWeight = await read(
      "GaugeController",
      "gauge_relative_weight_write(address,uint256)",
      gaugeAddress,
      startOfNextWeek,
    )
    console.log(
      `Gauge ${gaugeAddress} has relative weight of ${relativeWeight}`,
    )
  }
}
export default func
func.skip = async () => true
