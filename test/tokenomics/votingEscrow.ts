import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import { SDL, VotingEscrow } from "../../build/typechain/"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  setNextTimestamp,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai

const REVERT_CAN_ONLY_LOCK_FUTURE = "Can only lock until time in the future"
const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 2

describe("VotingEscrow", () => {
  let signers: Array<Signer>
  let malActor: Signer
  let deployer: Signer
  let deployerAddress: string
  let veSDL: VotingEscrow
  let sdl: SDL

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      deployerAddress = await deployer.getAddress()
      malActor = signers[10]

      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Ensure test setup is correct
      await sdl.enableTransfer()
      await sdl.approve(veSDL.address, BIG_NUMBER_1E18)
      expect(await veSDL.reward_pool()).to.eq(
        (await ethers.getContract("VeSDLRewards")).address,
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("create_lock", () => {
    it(`Reverts with reason string ${REVERT_CAN_ONLY_LOCK_FUTURE}`, async () => {
      await expect(
        veSDL.create_lock(BIG_NUMBER_1E18, await getCurrentBlockTimestamp()),
      ).to.be.revertedWith(REVERT_CAN_ONLY_LOCK_FUTURE)
    })

    it(`Creates a lock with correct parameters (max lock)`, async () => {
      // Need to set timestamp to ensure no unexpected rounding happens
      // Tue Apr 21 2048 00:00:00 GMT+0000 (UTC)
      const startTimestamp = 2471040000
      await setNextTimestamp(startTimestamp)

      const expireTimestamp = startTimestamp + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999944352000",
      )
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          expireTimestamp,
        ),
      ).to.eq("0")
    })

    it(`Creates a lock with correct parameters (max lock, applied weekly rounding)`, async () => {
      // Test the case when the lock is applied mid week, which causes the expire timestamp to be rounded down in weeks interval
      // Sat Apr 25 2048 04:00:00 GMT+0000 (UTC)
      const startTimestamp = 2471400000
      await setNextTimestamp(startTimestamp)

      const expireTimestamp = startTimestamp + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      const roundedDownExpireTimestamp = BigNumber.from(expireTimestamp)
        .div(WEEK)
        .mul(WEEK)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(
        roundedDownExpireTimestamp,
      )
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "994292237387592000",
      )
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          roundedDownExpireTimestamp,
        ),
      ).to.eq("0")
    })
  })
})
