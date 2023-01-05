import { expect } from "chai"
import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const LP_TOKEN_CONTRACT_NAME = "SaddleTBTCMetaPoolV3LPToken"
const REWARD_TOKEN_CONTRACT_NAME = "T"
const SIMPLE_REWARDER_CONTRACT_NAME = "SimpleRewarder"
const MINICHEFV2_CONTRACT_NAME = "MiniChefV2"
const NEW_SIMPLE_REWARDER_CONTRACT_NAME = `${SIMPLE_REWARDER_CONTRACT_NAME}_${REWARD_TOKEN_CONTRACT_NAME}_${LP_TOKEN_CONTRACT_NAME}`

const T_TEAM_MULTISIG_ADDRESS = "0xb78c0cf4c9e9bf4ba24b17065fa8c0ac71957653"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, execute, get, getOrNull, save, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getChainId()) === CHAIN_ID.HARDHAT) {
    log(
      `Running on hardhat. Skipping deploy of ${NEW_SIMPLE_REWARDER_CONTRACT_NAME}`,
    )
    return
  }

  if (!(await getOrNull(NEW_SIMPLE_REWARDER_CONTRACT_NAME))) {
    await deploy(NEW_SIMPLE_REWARDER_CONTRACT_NAME, {
      from: deployer,
      log: true,
      contract: SIMPLE_REWARDER_CONTRACT_NAME,
      args: [(await get(MINICHEFV2_CONTRACT_NAME)).address],
      skipIfAlreadyDeployed: true,
    })

    const PID = 8
    const lpToken = (await get(LP_TOKEN_CONTRACT_NAME)).address
    const rewardToken = (await get(REWARD_TOKEN_CONTRACT_NAME)).address // T token
    const rewardAdmin = T_TEAM_MULTISIG_ADDRESS // T team's OpEx wallet
    const rewardPerSecond = BigNumber.from("0") // Let T team handle the rate

    // Ensure pid is correct
    expect(await read(MINICHEFV2_CONTRACT_NAME, "lpToken", PID)).to.eq(lpToken)

    // (IERC20 rewardToken, address owner, uint256 rewardPerSecond, IERC20 masterLpToken, uint256 pid)
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256", "address", "uint256"],
      [
        rewardToken, // KEEP token
        rewardAdmin, // KEEP team's OpEx wallet
        rewardPerSecond, // 250k KEEP weekly
        lpToken, // master LP token
        PID, // pid
      ],
    )

    await execute(
      NEW_SIMPLE_REWARDER_CONTRACT_NAME,
      { from: deployer, log: true },
      "init",
      data,
    )
  }
}
func.skip = async (env) => false
export default func
