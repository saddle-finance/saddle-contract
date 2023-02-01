import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const VETH2_TOKENS_ARGS: { [token: string]: any[] } = {
  WETH: ["Wrapped Ether", "WETH", "18"],
  VETH2: ["validator-Eth2", "vETH2", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  for (const token in VETH2_TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: VETH2_TOKENS_ARGS[token],
      skipIfAlreadyDeployed: true,
    })
    // If it's on hardhat, mint test tokens
    if (isTestNetwork(await getChainId())) {
      const decimals = VETH2_TOKENS_ARGS[token][2]
      await execute(
        token,
        { from: deployer, log: true },
        "mint",
        deployer,
        BigNumber.from(10).pow(decimals).mul(1000),
      )
    }
  }
}
export default func
func.tags = ["VETH2PoolTokens"]
