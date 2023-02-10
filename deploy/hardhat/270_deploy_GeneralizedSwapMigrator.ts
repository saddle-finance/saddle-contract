import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { GeneralizedSwapMigrator } from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const genSwapMigrator = await getOrNull("GeneralizedSwapMigrator")
  if (genSwapMigrator) {
    log(`reusing "GeneralizedSwapMigrator" at ${genSwapMigrator.address}`)
  } else {
    await deploy("GeneralizedSwapMigrator", {
      from: deployer,
      log: true,
    })

    const contract: GeneralizedSwapMigrator = await ethers.getContract(
      "GeneralizedSwapMigrator",
    )
    const batchCall = [
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleUSDPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleUSDPoolV2")).address,
          oldPoolLPTokenAddress: (await get("SaddleUSDPoolLPToken")).address,
          newPoolLPTokenAddress: (await get("SaddleUSDPoolV2LPToken")).address,
          tokens: [
            (await get("DAI")).address,
            (await get("USDC")).address,
            (await get("USDT")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleSUSDMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleSUSDMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleSUSDMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleSUSDMetaPoolUpdatedLPToken")
          ).address,
          tokens: [
            (await get("SUSD")).address,
            (await get("SaddleUSDPoolV2LPToken")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleTBTCMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleTBTCMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleTBTCMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleTBTCMetaPoolUpdatedLPToken")
          ).address,
          tokens: [
            (await get("TBTCv2")).address,
            (await get("SaddleBTCPoolV2LPToken")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleWCUSDMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleWCUSDMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleWCUSDMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleWCUSDMetaPoolUpdatedLPToken")
          ).address,
          tokens: [
            (await get("WCUSD")).address,
            (await get("SaddleUSDPoolV2LPToken")).address,
          ],
        },
        false,
      ),
    ]

    if ((await getChainId()) == CHAIN_ID.MAINNET) {
      batchCall.push(
        await contract.populateTransaction.transferOwnership(
          MULTISIG_ADDRESSES[await getChainId()],
        ),
      )
    }

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "GeneralizedSwapMigrator",
      {
        from: deployer,
        log: true,
      },
      "batch",
      batchCallData,
      true,
    )
  }
}
export default func
func.tags = ["GeneralizedSwapMigrator"]
func.dependencies = [
  "SUSDMetaPool",
  "SUSDMetaPoolUpdated",
  "TBTCMetaPool",
  "TBTCMetaPoolUpdated",
  "WCUSDMetaPool",
  "WCUSDMetaPoolUpdated",
]
