import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { getCurrentBlockTimestamp } from "../../test/testUtils"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  const chainId = await getChainId()

  // If we are on hardhat, deploy a generic erc20 for the fee token.
  if (chainId === CHAIN_ID.HARDHAT) {
    await deploy("SushiSwapPairSDLFRAX", {
      from: libraryDeployer,
      contract: "GenericERC20",
      log: true,
      args: ["Dummy SushiSwap LP token", "testLP", 18],
      skipIfAlreadyDeployed: true,
    })
  }

  // read the current admin
  await deploy("FeeDistributor", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("VotingEscrow")).address,
      (await get("VeSDLRewards")).address,
      await getCurrentBlockTimestamp(), // TODO: use prod timestamp
      (await get("SushiSwapPairSDLFRAX")).address,
      deployer, // admin that can trigger clawback and kill the contract
      MULTISIG_ADDRESSES[chainId], // emergency admin that receieves all of the fee tokens
    ],
  })
}
export default func
func.tags = ["veSDL"]
