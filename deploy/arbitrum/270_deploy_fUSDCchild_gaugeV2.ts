import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { convertGaugeNameToSalt } from "../../test/testUtils"
import { deployChildGauges } from "../deployUtils"

/**
 * @notice Deploy the child gauges on Arbitrum
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { get, execute, save, getOrNull } = deployments
  const { deployer } = await getNamedAccounts()

  // return if an esixsting deployment for "ChildGauge_CommunityfUSDCPoolLPTokenV2" is present
  if (await getOrNull("ChildGauge_CommunityfUSDCPoolLPTokenV2")) {
    return
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  // *Note, usually this name lines up with what is in the registry
  // but for this edge case we are using a custom name to differentiate
  // a newer version of the child gauge
  const lpTokenRegistryName = "fUSDC-USDC pool V2"
  const lpToken = await get("CommunityfUSDCPoolLPToken")

  // Broadcast the transaction
  const tx = await execute(
    "ChildGaugeFactory",
    executeOptions,
    "deploy_gauge(address,bytes32,string)",
    lpToken.address,
    convertGaugeNameToSalt(lpTokenRegistryName),
    lpTokenRegistryName,
  )

  // Find the deployed gauge address from the event logs
  const gaugeAddress: string = tx.events?.find(
    (e) => e.event === "DeployedGauge",
  )?.args?._gauge

  // Save the info to the deployment json folder
  await save(`ChildGauge_CommunityfUSDCPoolLPTokenV2`, {
    abi: (await get("ChildGauge")).abi,
    address: gaugeAddress,
  })

  // Set the child gauge as mirrored
  await execute(
    "ChildGaugeFactory",
    executeOptions,
    "set_mirrored",
    gaugeAddress,
    true,
  )
}
export default func
// func.skip = async () => true
