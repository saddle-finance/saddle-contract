import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { getCurrentBlockTimestamp } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

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
      MULTISIG_ADDRESSES[await getChainId()], // emergency admin that receieves all of the fee tokens
    ],
  })
}
export default func
