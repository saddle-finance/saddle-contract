import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleTBTCMetaPoolDeposit = await getOrNull(
    "SaddleTBTCMetaPoolUpdatedDeposit",
  )
  if (saddleTBTCMetaPoolDeposit) {
    log(
      `reusing "SaddleTBTCMetaPoolUpdatedDeposit" at ${saddleTBTCMetaPoolDeposit.address}`,
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
    const metaSwapDeposit = newPoolEvent["args"]["cloneAddress"]
    log(
      `deployed TBTC meta pool deposit (targeting "MetaPoolDeposit") at ${metaSwapDeposit}`,
    )
    await save("SaddleTBTCMetaPoolUpdatedDeposit", {
      abi: (await get("SaddleSUSDMetaPoolDeposit")).abi,
      address: metaSwapDeposit,
    })

    await execute(
      "SaddleTBTCMetaPoolUpdatedDeposit",
      { from: deployer, log: true, gasLimit: 1_000_000 },
      "initialize",
      (
        await get("SaddleBTCPoolV2")
      ).address,
      (
        await get("SaddleTBTCMetaPoolUpdated")
      ).address,
      (
        await get("SaddleTBTCMetaPoolLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["TBTCMetaPoolUpdatedDeposit"]
func.dependencies = ["TBTCMetaPoolTokens", "TBTCMetaPoolUpdated"]
