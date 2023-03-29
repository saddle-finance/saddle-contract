import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre
  const { deploy, get, save } = deployments
  const { deployer } = await getNamedAccounts()

  if (network.name !== "hardhat") {
    return
  }
  const MAX_UINT256 = ethers.constants.MaxUint256

  const DummyERC20Factory = await ethers.getContractFactory("DummyERC20")
  const Dummy1 = await DummyERC20Factory.attach(
    (
      await get("Dummy1")
    ).address, // The deployed contract address
  )
  const Dummy2 = await DummyERC20Factory.attach(
    (
      await get("Dummy2")
    ).address, // The deployed contract address
  )
  const signers = await hre.ethers.getSigners()
  const DummyPoolAddress = (await get("SaddleDummyPool")).address
  await Dummy1.connect(signers[1]).mint(
    signers[1].address,
    BigNumber.from("10000000000000000000"),
  )
  await Dummy2.connect(signers[1]).mint(
    signers[1].address,
    BigNumber.from("10000000000000000000"),
  )
  await Dummy1.connect(signers[1]).approve(DummyPoolAddress, MAX_UINT256)
  await Dummy2.connect(signers[1]).approve(DummyPoolAddress, MAX_UINT256)
  console.log((await Dummy1.balanceOf(signers[1].address)).toString())
  console.log((await Dummy2.balanceOf(signers[1].address)).toString())

  const DummyPoolFactory = await await ethers.getContractFactory("SwapV2", {
    libraries: {
      AmplificationUtilsV2: (await get("AmplificationUtilsV2")).address,
      SwapUtilsV2: (await get("SwapUtilsV2")).address,
    },
  })
  const DummyPoolInstance = await DummyPoolFactory.attach(
    DummyPoolAddress, // The deployed contract address
  )
  console.log("adding liquidity")
  await DummyPoolInstance.connect(signers[1]).addLiquidity(
    [String(10e18), String(10e18)],
    0,
    MAX_UINT256,
  )
  console.log("added liquidity")
}
export default func
