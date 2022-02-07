import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const { deployer } = await getNamedAccounts()

  const META_SWAP_DEPOSIT_NAME = "SaddleArbUSDSMetaPoolDeposit"
  const BASE_POOL_NAME = "SaddleArbUSDPoolV2"
  const META_POOL_NAME = "SaddleArbUSDSMetaPool"
  const META_POOL_LPTOKEN_NAME = "SaddleArbUSDSMetaPoolLPToken"

  // Manually check if the pool is already deployed
  const metaPoolDeposit = await getOrNull(META_SWAP_DEPOSIT_NAME)
  if (metaPoolDeposit) {
    log(`reusing ${META_SWAP_DEPOSIT_NAME} at ${metaPoolDeposit.address}`)
  } else {
    await execute(
      "MetaSwapDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get(BASE_POOL_NAME)
      ).address,
      (
        await get(META_POOL_NAME)
      ).address,
      (
        await get(META_POOL_LPTOKEN_NAME)
      ).address,
    )

    await save(META_SWAP_DEPOSIT_NAME, await get("MetaSwapDeposit"))
  }
}
export default func
