import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MasterRegistry, PoolRegistry } from "../../build/typechain"
import {
  MULTISIG_ADDRESSES,
  OPS_MULTISIG_ADDRESSES,
} from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // Pool Registry
  const poolRegistry = (await ethers.getContract(
    "PoolRegistry",
  )) as PoolRegistry
  if (
    await poolRegistry.hasRole(
      await poolRegistry.DEFAULT_ADMIN_ROLE(),
      deployer,
    )
  ) {
    const batchCall = [
      // Give the ops multisig the saddle & community manager role, revoke deployer's roles
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.SADDLE_MANAGER_ROLE(),
        OPS_MULTISIG_ADDRESSES[await getChainId()],
      ),
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        OPS_MULTISIG_ADDRESSES[await getChainId()],
      ),
      await poolRegistry.populateTransaction.revokeRole(
        await poolRegistry.SADDLE_MANAGER_ROLE(),
        deployer,
      ),
      await poolRegistry.populateTransaction.revokeRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        deployer,
      ),
      // After roles are set, give admin access to the multisig
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.DEFAULT_ADMIN_ROLE(),
        OPS_MULTISIG_ADDRESSES[await getChainId()],
      ),
      await poolRegistry.populateTransaction.revokeRole(
        await poolRegistry.DEFAULT_ADMIN_ROLE(),
        deployer,
      ),
    ]

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "PoolRegistry",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )
    console.log("PoolRegistry roles set")
  }

  const masterRegistry = (await ethers.getContract(
    "MasterRegistry",
  )) as MasterRegistry

  if (
    await masterRegistry.hasRole(
      await masterRegistry.DEFAULT_ADMIN_ROLE(),
      deployer,
    )
  ) {
    const batchCall = [
      // Grant the ops multisig the saddle manager role, revoke deployer's role
      await masterRegistry.populateTransaction.grantRole(
        await masterRegistry.SADDLE_MANAGER_ROLE(),
        OPS_MULTISIG_ADDRESSES[await getChainId()],
      ),
      await masterRegistry.populateTransaction.revokeRole(
        await masterRegistry.SADDLE_MANAGER_ROLE(),
        deployer,
      ),
      // After roles are set, give admin access to the multisig
      await masterRegistry.populateTransaction.grantRole(
        await masterRegistry.DEFAULT_ADMIN_ROLE(),
        MULTISIG_ADDRESSES[await getChainId()],
      ),
      await masterRegistry.populateTransaction.revokeRole(
        await masterRegistry.DEFAULT_ADMIN_ROLE(),
        deployer,
      ),
    ]

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "MasterRegistry",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )

    console.log("MasterRegistry roles set")
  }
}
export default func
func.skip = async () => true
