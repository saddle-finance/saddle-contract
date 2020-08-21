import { waffle, ethers } from "@nomiclabs/buidler"
import { Wallet, Signer, constants } from "ethers";
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"
import { utils } from "ethers"

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

chai.use(solidity)
const { expect } = chai

describe("MathUtils", () => {
  const provider = waffle.provider
  let signers: Array<Signer>

  let mathUtils: MathUtils

  beforeEach(async () => {
    signers = await ethers.getSigners()
    mathUtils = (await deployContract(
      <Wallet>signers[0],
      MathUtilsArtifact,
    )) as MathUtils
  })

  describe("within1", () => {
    it("Returns true when a > b and a - b <= 1", async () => {
        expect(await mathUtils.within1(2, 1)).to.eq(true)
    })

    it("Returns false when a > b and a - b > 1", async () => {
        expect(await mathUtils.within1(3, 1)).to.eq(false)
    })

    it("Returns true when a <= b and b - a <= 1", async () => {
        expect(await mathUtils.within1(1, 2)).to.eq(true)
    })

    it("Returns false when a <= b and b - a > 1", async () => {
        expect(await mathUtils.within1(1, 3)).to.eq(false)
    })

    it("Reverts during an integer overflow", async () => {
        await expect(
          mathUtils.within1(constants.MaxUint256, -1)
        ).to.be.reverted
    })
  })

  describe("difference", () => {
    it("Returns correct difference when a > b", async () => {
        expect(await mathUtils.difference(3, 1)).to.eq(2)
    })

    it("Returns correct difference when a <= b", async () => {
        expect(await mathUtils.difference(1, 3)).to.eq(2)
    })

    it("Reverts during an integer overflow", async () => {
        await expect(
          mathUtils.difference(-1, constants.MaxUint256)
        ).to.be.reverted
    })
  })
})
