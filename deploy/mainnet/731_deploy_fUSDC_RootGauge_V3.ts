import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { convertGaugeNameToSalt } from "../../test/testUtils"
import { CHAIN_ID } from "../../utils/network"

/*
 * Deploy Root & Child Gauges for Arbitrum using RootGaugeFactory.
 *
 * This script calls `RootGaugeFactory.deploy_child_gauges()` for each LPToken on Arbitrum chain ID.
 * This will initiate a deploy on Arbitrum side using AnyCallV6 which will then
 * call `RootGaugeFactory.deploy_gauge()` on Ethereum Mainnnet Chain.
 *
 * The entire process is expected to take at least 20 minutes after initial txs are
 * confirmed on Ethereum Mainnet.
 *
 * Progress can be tracked by anyswap explorer: https://anyswap.net/
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { get, execute, save, getOrNull } = deployments
  const { deployer } = await getNamedAccounts()

  const executeOptions = {
    log: true,
    from: deployer,
  }

  const targetChainId = CHAIN_ID.ARBITRUM_MAINNET

  const lpTokenNameToRegistryName: Record<string, string> = {
    CommunityfUSDCPoolLPTokenV3: "fUSDC-USDC poolV3",
  }

  // For each LP token, call deploy_gauge
  for (const lpTokenName in lpTokenNameToRegistryName) {
    const lpTokenRegistryName = lpTokenNameToRegistryName[lpTokenName]

    // Check if gauge is already deployed
    const gaugeDeployment = await getOrNull(
      `RootGauge_${targetChainId}_${lpTokenName}`,
    )
    if (gaugeDeployment) {
      console.log(
        `Gauge for ${lpTokenName} on chain ${targetChainId} already deployed at ${gaugeDeployment.address}`,
      )
      continue
    }

    // Broadcast the transaction
    const tx = await execute(
      "RootGaugeFactory",
      {
        ...executeOptions,
        gasLimit: 2000000,
      },
      "deploy_gauge",
      targetChainId, // chainId
      convertGaugeNameToSalt(lpTokenRegistryName), // salt
      lpTokenRegistryName, // name that will be included in the gauge name
    )

    // Find the deployed gauge address from the event logs
    const gaugeAddress: string = tx.events?.find(
      (e) => e.event === "DeployedGauge",
    )?.args?._gauge

    // Save the info to the deployment json folder
    await save(`RootGauge_${targetChainId}_${lpTokenName}`, {
      abi: (await get("RootGauge")).abi,
      address: gaugeAddress,
    })
  }
}
export default func
// func.skip = async () => true
