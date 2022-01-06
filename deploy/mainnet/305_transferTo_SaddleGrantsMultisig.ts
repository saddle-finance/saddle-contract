import { BIG_NUMBER_1E18 } from "../../test/testUtils"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // Transfer 0.75% to Saddle Grants Multisig
  await execute(
    "SDL",
    { from: deployer, log: true },
    "transfer",
    "0x87f194b4175d415E399E5a77fCfdFA66040199b6",
    BIG_NUMBER_1E18.mul(7_500_000),
  )
}
export default func
func.tags = ["MiniChef"]
