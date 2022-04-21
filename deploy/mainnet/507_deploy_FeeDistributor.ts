import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { getCurrentBlockTimestamp } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
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
      (
        await get("SDL")
      ).address, // TODO: determine which token to use for fee distribution
      deployer, // admin that can trigger clawback and kill the contract
      MULTISIG_ADDRESSES[await getChainId()], // emergency admin that receieves all of the fee tokens
    ],
  })
}
export default func
