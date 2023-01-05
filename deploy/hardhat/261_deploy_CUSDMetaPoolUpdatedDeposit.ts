import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleWCUSDMetaPool = await getOrNull(
    "SaddleWCUSDMetaPoolUpdatedDeposit",
  )
  if (saddleWCUSDMetaPool) {
    log(
      `reusing "SaddleWCUSDMetaPoolUpdatedDeposit" at ${saddleWCUSDMetaPool.address}`,
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
      `deployed WCUSD meta pool deposit (targeting "MetaPoolDeposit") at ${metaSwapDeposit}`,
    )
    await save("SaddleWCUSDMetaPoolUpdatedDeposit", {
      abi: (await get("SaddleSUSDMetaPoolDeposit")).abi,
      address: metaSwapDeposit,
    })

    await execute(
      "SaddleWCUSDMetaPoolUpdatedDeposit",
      { from: deployer, log: true, gasLimit: 1_000_000 },
      "initialize",
      (
        await get("SaddleUSDPoolV2")
      ).address,
      (
        await get("SaddleWCUSDMetaPoolUpdated")
      ).address,
      (
        await get("SaddleWCUSDMetaPoolUpdatedLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["WCUSDMetaPoolUpdatedDeposit"]
func.dependencies = ["WCUSDMetaPoolTokens", "WCUSDMetaPoolUpdated"]
