import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../../utils/network"
import { FRAX_MULTISIG_ADDRESSES } from "../../utils/accounts"

const SMART_WALLET_CHECKER_NAME = "SmartWalletChecker"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const smartWalletChecker = await getOrNull(SMART_WALLET_CHECKER_NAME)
  if (smartWalletChecker) {
    log(`reusing ${SMART_WALLET_CHECKER_NAME} at ${smartWalletChecker.address}`)
  } else {
    await deploy(SMART_WALLET_CHECKER_NAME, {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [true],
    })

    await execute(
      SMART_WALLET_CHECKER_NAME,
      {
        from: deployer,
        log: true,
      },
      "approveWallet",
      FRAX_MULTISIG_ADDRESSES[CHAIN_ID.MAINNET],
    )
  }
}

export default func
