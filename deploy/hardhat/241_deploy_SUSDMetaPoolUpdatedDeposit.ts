import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPool = await getOrNull("SaddleSUSDMetaPoolUpdatedDeposit")
  if (saddleSUSDMetaPool) {
    log(
      `reusing "SaddleSUSDMetaPoolUpdatedDeposit" at ${saddleSUSDMetaPool.address}`,
    )
  } else {
    const receipt = await execute(
      "SwapDeployer",
      {
        from: deployer,
        log: true,
      },
      "clone",
      (
        await get("SaddleSUSDMetaPoolDeposit")
      ).address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] == "NewClone",
    )
    const metaSwapDepositAddress = newPoolEvent["args"]["cloneAddress"]
    log(
      `deployed SUSD meta pool deposit (targeting "MetaPoolDeposit") at ${metaSwapDepositAddress}`,
    )
    await save("SaddleSUSDMetaPoolUpdatedDeposit", {
      abi: (await get("SaddleSUSDMetaPoolDeposit")).abi,
      address: metaSwapDepositAddress,
    })

    await execute(
      "SaddleSUSDMetaPoolUpdatedDeposit",
      { from: deployer, log: true, gasLimit: 1_000_000 },
      "initialize",
      (
        await get("SaddleUSDPoolV2")
      ).address,
      (
        await get("SaddleSUSDMetaPoolUpdated")
      ).address,
      (
        await get("SaddleSUSDMetaPoolUpdatedLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["SUSDMetaPoolUpdatedDeposit"]
func.dependencies = ["SUSDMetaPoolTokens", "SUSDMetaPoolUpdated"]
