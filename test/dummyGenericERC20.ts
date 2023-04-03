import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import { DummyERC20, Swap } from "../build/typechain"
import { MAX_UINT256 } from "./testUtils"

const { expect } = chai

describe("DummyERC20", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let firstToken: DummyERC20
  let secondToken: DummyERC20
  let swap: Swap
  const { get } = deployments
  it("Mints correct amount of tokens", async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    await deployments.fixture(["Swap", "LPToken"])

    // Deploy dummy tokens
    const DummyERC20Factory = await ethers.getContractFactory("DummyERC20")
    firstToken = (await DummyERC20Factory.deploy(
      "FreeMintableDummyERC20_1",
      "Dummy1",
    )) as DummyERC20
    await expect(
      firstToken.mint(await owner.getAddress(), String(10e18)),
    ).to.changeTokenBalance(firstToken, owner, String(10e18))
    secondToken = (await DummyERC20Factory.deploy(
      "FreeMintableDummyERC20_2",
      "Dummy2",
    )) as DummyERC20
    await expect(
      secondToken.mint(await owner.getAddress(), String(10e18)),
    ).to.changeTokenBalance(secondToken, owner, String(10e18))

    swap = await ethers.getContract("Swap")
    // DummyPoolInstance = (await DummyPoolFactory.deploy()) as SwapV2
    await swap.initialize(
      [firstToken.address, secondToken.address],
      [18, 18],
      "DummyPoolLPToken",
      "DummyDummy",
      100,
      100,
      0,
      (
        await get("LPToken")
      ).address,
    )
    // Approve pool to use both tokens
    await firstToken.approve(swap.address, MAX_UINT256)
    await secondToken.approve(swap.address, MAX_UINT256)

    // Add liquidity
    await swap.addLiquidity([String(10e18), String(10e18)], 0, MAX_UINT256)
  })
})
// const MAX_UINT256 = ethers.constants.MaxUint256

//   const DummyERC20Factory = await ethers.getContractFactory("DummyERC20")
//   const Dummy1 = await DummyERC20Factory.attach(
//     (
//       await get("Dummy1")
//     ).address, // The deployed contract address
//   )
//   const Dummy2 = await DummyERC20Factory.attach(
//     (
//       await get("Dummy2")
//     ).address, // The deployed contract address
//   )
//   const signers = await hre.ethers.getSigners()
//   const DummyPoolAddress = (await get("SaddleDummyPool")).address
//   await Dummy1.connect(signers[1]).mint(
//     signers[1].address,
//     BigNumber.from("10000000000000000000"),
//   )
//   await Dummy2.connect(signers[1]).mint(
//     signers[1].address,
//     BigNumber.from("10000000000000000000"),
//   )
//   await Dummy1.connect(signers[1]).approve(DummyPoolAddress, MAX_UINT256)
//   await Dummy2.connect(signers[1]).approve(DummyPoolAddress, MAX_UINT256)
//   console.log((await Dummy1.balanceOf(signers[1].address)).toString())
//   console.log((await Dummy2.balanceOf(signers[1].address)).toString())

//   const DummyPoolFactory = await await ethers.getContractFactory("SwapV2", {
//     libraries: {
//       AmplificationUtilsV2: (await get("AmplificationUtilsV2")).address,
//       SwapUtilsV2: (await get("SwapUtilsV2")).address,
//     },
//   })
//   const DummyPoolInstance = await DummyPoolFactory.attach(
//     DummyPoolAddress, // The deployed contract address
//   )
//   console.log("adding liquidity")
//   await DummyPoolInstance.connect(signers[1]).addLiquidity(
//     [String(10e18), String(10e18)],
//     0,
//     MAX_UINT256,
//   )
//   console.log("added liquidity")
