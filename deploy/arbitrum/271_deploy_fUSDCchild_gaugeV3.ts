import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { convertGaugeNameToSalt } from "../../test/testUtils"

/**
 * @notice Deploy the child gauges on Arbitrum
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { get, execute, save } = deployments
  const { deployer } = await getNamedAccounts()

  // If deployment is not found for the child gauge, deploy it
  if (
    !(await deployments.getOrNull("ChildGauge_CommunityfUSDCPoolLPTokenV3"))
  ) {
    const executeOptions = {
      log: true,
      from: deployer,
    }

    // Broadcast the transaction
    console.log(convertGaugeNameToSalt("fUSDC-USDC poolV3"))
    const tx = await execute(
      "ChildGaugeFactory",
      { log: true, from: deployer },
      "deploy_gauge(address,bytes32,string)",
      (
        await get("CommunityfUSDCPoolLPToken")
      ).address,
      convertGaugeNameToSalt("fUSDC-USDC poolV3"),
      "fUSDC-USDC poolV3",
    )

    // Find the deployed gauge address from the event logs
    const gaugeAddress: string = tx.events?.find(
      (e) => e.event === "DeployedGauge",
    )?.args?._gauge

    // Save the info to the deployment json folder
    await save(`ChildGauge_CommunityfUSDCPoolLPTokenV3`, {
      abi: (await get("ChildGauge")).abi,
      address: gaugeAddress,
    })

    await execute(
      "ChildGaugeFactory",
      executeOptions,
      "set_mirrored",
      gaugeAddress,
      true,
    )
  }
}
export default func
// func.skip = async () => true
