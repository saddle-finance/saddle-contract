import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, ethers } = hre
  const { log } = deployments
  const contracts: string[] = [
    "LPToken",
    "AmplificationUtils",
    "SwapUtils",
    "MetaSwapUtils",
    "SwapFlashLoan",
    "Saddle3Pool",
    "Multicall",
    "Muticall2",
    "Muticall3",
  ]

  if ((await getChainId()) === CHAIN_ID.KAVA_MAINNET) {
    for (let i = 0; i < contracts.length; i++) {
      const contractName = contracts[i]
      const contract = await ethers.getContract(contracts[i])
      try {
        await hre.run("etherscan-verify", {
          contractName: contractName,
        })
        console.log(
          `Successfully verified ${contractName} at ${contract.address}`,
        )
      } catch (error) {
        console.log("verification failed with: ", error)
      }
    }
  } else {
    log(
      `Skipping verification since this is not running on ${CHAIN_ID.KAVA_MAINNET}`,
    )
  }
}
export default func
