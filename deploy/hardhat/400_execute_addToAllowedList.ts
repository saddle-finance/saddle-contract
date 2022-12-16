import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, execute, get } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  await execute("SDL", { from: deployer, log: true }, "addToAllowedList", [
    (await get("RetroactiveVesting")).address,
    (await get("MiniChefV2")).address,
    // Saddle grants multisig
    "0x87f194b4175d415E399E5a77fCfdFA66040199b6",
  ])
}
export default func
func.tags = ["addToAllowedList"]
func.skip = async (hre) => (await hre.getChainId()) !== CHAIN_ID.HARDHAT
