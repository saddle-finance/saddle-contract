import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

/*
 * Save any new Root Gauge addresses as deployment json files for mainnet.
 *
 * This script reads the current root gauge count from the RootGaugeFactory for
 * each chain ID then saves each gauge address to deployment json file if
 * it is not already saved.
 *
 * Note this should be run everytime after `RootGaugeFactory.deploy_child_gauges`
 * calls are fully completed.
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre
  const { get, log, read, save, getOrNull } = deployments

  // Chain ids where child gauges have been deployed
  const targetChainIds = [CHAIN_ID.ARBITRUM_MAINNET, CHAIN_ID.OPTIMISM_MAINNET]

  for (const targetChainId of targetChainIds) {
    // Read the current root gauge count
    const gaugeCount = await read(
      "RootGaugeFactory",
      "get_gauge_count",
      targetChainId,
    )

    log(`RootGaugeFactory.get_gauge_count(${targetChainId}): ${gaugeCount}`)

    // For each gauge, find the address via get_gauge(uint256) function
    // then read the name via name() function
    for (let i = 0; i < gaugeCount; i++) {
      const gaugeAddress = await read(
        "RootGaugeFactory",
        "get_gauge",
        targetChainId,
        i,
      )

      // Root gauge names are formatted like below:
      // "Saddle " + poolName + " Root Gauge"
      const gaugeName = await (
        await ethers.getContractAt("RootGauge", gaugeAddress)
      ).name()

      // Assume that the gauge name is formatted as above and extract the pool name
      const poolName = gaugeName.split(" ")[1]

      log(
        `RootGauge for ${targetChainId} index ${i}: ${gaugeName} at ${gaugeAddress}`,
      )

      // Build the name that will be used for deployment json files
      const deploymentName = `RootGauge_${targetChainId}_${poolName}`

      // Save the root gauge address if it doesn't already exist
      if ((await getOrNull(deploymentName)) == null) {
        // Manually save with RootGauge abi
        await save(deploymentName, {
          abi: (await get("RootGauge")).abi,
          address: gaugeAddress,
        })
      }
    }
  }
}
export default func
