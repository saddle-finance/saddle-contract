import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

// Deployment names
const META_POOL_NAME = "SaddleSUSDMetaPoolV3"
const META_POOL_LP_TOKEN_NAME = `${META_POOL_NAME}LPToken`
const META_POOL_DEPOSIT_NAME = `${META_POOL_NAME}Deposit`
const TARGET_META_SWAP_DEPOSIT_NAME = `MetaSwapDeposit`
const BASE_POOL_NAME = `SaddleUSDPoolV2`

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const metaPoolDeposit = await getOrNull(META_POOL_DEPOSIT_NAME)
  if (metaPoolDeposit) {
    log(`reusing ${META_POOL_DEPOSIT_NAME} at ${metaPoolDeposit.address}`)
  } else {
    const receipt = await execute(
      "SwapDeployer",
      {
        from: deployer,
        log: true,
      },
      "clone",
      (
        await get(TARGET_META_SWAP_DEPOSIT_NAME)
      ).address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] === "NewClone",
    )
    const deployedAddress = newPoolEvent["args"]["cloneAddress"]
    log(
      `deployed ${META_POOL_DEPOSIT_NAME} (targeting ${TARGET_META_SWAP_DEPOSIT_NAME}) at ${deployedAddress}`,
    )
    await save(META_POOL_DEPOSIT_NAME, {
      abi: (await get(TARGET_META_SWAP_DEPOSIT_NAME)).abi,
      address: deployedAddress,
    })

    await execute(
      META_POOL_DEPOSIT_NAME,
      { from: deployer, log: true, gasLimit: 1_000_000 },
      "initialize",
      (
        await get(BASE_POOL_NAME)
      ).address,
      (
        await get(META_POOL_NAME)
      ).address,
      (
        await get(META_POOL_LP_TOKEN_NAME)
      ).address,
    )
  }
}
export default func
func.tags = [META_POOL_DEPOSIT_NAME]
func.dependencies = ["SUSDMetaPoolTokens", META_POOL_NAME]
