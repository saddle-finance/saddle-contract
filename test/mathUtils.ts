import { constants } from "ethers"
import { solidity } from "ethereum-waffle"

import { TestMathUtils } from "../build/typechain/TestMathUtils"
import chai from "chai"
import { ethers } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("MathUtils", () => {
  let mathUtils: TestMathUtils

  beforeEach(async () => {
    const testMathUtilsFactory = await ethers.getContractFactory(
      "TestMathUtils",
    )
    mathUtils = (await testMathUtilsFactory.deploy()) as TestMathUtils
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
      await expect(mathUtils.within1(constants.MaxUint256, -1)).to.be.reverted
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
      await expect(mathUtils.difference(-1, constants.MaxUint256)).to.be
        .reverted
    })
  })
})
