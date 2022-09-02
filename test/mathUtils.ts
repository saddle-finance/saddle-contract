import chai from "chai"
import { constants } from "ethers"
import { ethers } from "hardhat"
import { TestMathUtils } from "../build/typechain/"

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

    it("Returns false when a = 0, b = MaxUint256", async () => {
      expect(await mathUtils.within1(0, constants.MaxUint256)).to.eq(false)
    })

    it("Returns false when a = MaxUint256, b = 0", async () => {
      expect(await mathUtils.within1(constants.MaxUint256, 0)).to.eq(false)
    })
  })

  describe("difference", () => {
    it("Returns correct difference when a > b", async () => {
      expect(await mathUtils.difference(3, 1)).to.eq(2)
    })

    it("Returns correct difference when a <= b", async () => {
      expect(await mathUtils.difference(1, 3)).to.eq(2)
    })

    it("Returns correct difference when a and b are on the extremes", async () => {
      expect(await mathUtils.difference(0, constants.MaxUint256)).to.be.eq(
        constants.MaxUint256,
      )
      expect(await mathUtils.difference(constants.MaxUint256, 0)).to.be.eq(
        constants.MaxUint256,
      )
    })
  })
})
