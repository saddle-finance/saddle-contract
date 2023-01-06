import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, ethers } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleTBTCMetaPoolDeposit = await getOrNull("SaddleTBTCMetaPoolDeposit")
  if (saddleTBTCMetaPoolDeposit) {
    log(
      `reusing "SaddleTBTCMetaPoolDeposit" at ${saddleTBTCMetaPoolDeposit.address}`,
    )
  } else {
    const susdMetaPoolDeposit = await ethers.getContract(
      "SaddleSUSDMetaPoolDeposit",
    )

    const receipt = await execute(
      "SwapDeployer",
      {
        from: deployer,
        log: true,
      },
      "clone",
      susdMetaPoolDeposit.address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] == "NewClone",
    )
    const btcSwapAddress = newPoolEvent["args"]["cloneAddress"]
    log(
      `deployed TBTC meta pool deposit (targeting "MetaPoolDeposit") at ${btcSwapAddress}`,
    )
    await save("SaddleTBTCMetaPoolDeposit", {
      abi: (await get("SaddleSUSDMetaPoolDeposit")).abi,
      address: btcSwapAddress,
    })

    await execute(
      "SaddleTBTCMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get("SaddleBTCPoolV2")
      ).address,
      (
        await get("SaddleTBTCMetaPool")
      ).address,
      (
        await get("SaddleTBTCMetaPoolLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["TBTCMetaPoolDeposit"]
func.dependencies = ["TBTCMetaPoolTokens", "TBTCMetaPool"]
