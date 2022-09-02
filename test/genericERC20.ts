import chai from "chai"
import { Signer } from "ethers"
import { ethers } from "hardhat"
import { GenericERC20 } from "../build/typechain/"

const { expect } = chai

describe("GenericERC20", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let firstToken: GenericERC20

  it("Reverts when minting 0", async () => {
    signers = await ethers.getSigners()
    owner = signers[0]

    // Deploy dummy tokens
    const erc20Factory = await ethers.getContractFactory("GenericERC20")
    firstToken = (await erc20Factory.deploy(
      "First Token",
      "FIRST",
      "18",
    )) as GenericERC20
    await expect(firstToken.mint(await owner.getAddress(), 0)).to.be.reverted
  })
})
