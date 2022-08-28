import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, BigNumberish, Signer } from "ethers"
import { deployments } from "hardhat"
import { SDL, VotingEscrow } from "../../build/typechain/"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setNextTimestamp,
  setTimestamp,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai

const REVERT_MSG_ONLY_LOCK_FUTURE = "Can only lock until time in the future"
const REVERT_MSG_NO_EXISTING_LOCK = "No existing lock found"
const REVERT_MSG_TOO_EARLY_TO_UNLOCK =
  "The lock didn't expire and funds are not unlocked"

const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

// Helper function to calculate user's expected veSDL amount on the frontend
function calculateLockAmount(
  totalAmount: BigNumberish,
  currentTimestamp: BigNumberish,
  expireTimestamp: BigNumberish,
) {
  const roundedExpireTimestamp = BigNumber.from(expireTimestamp)
    .div(WEEK)
    .mul(WEEK)

  return BigNumber.from(totalAmount)
    .mul(BigNumber.from(roundedExpireTimestamp).sub(currentTimestamp))
    .div(MAXTIME)
}

describe("VotingEscrow", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let deployerAddress: string
  let veSDL: VotingEscrow
  let sdl: SDL

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      deployerAddress = users[0]

      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Ensure test setup is correct
      if (await sdl.paused()) {
        await sdl.enableTransfer()
      }

      await sdl.approve(veSDL.address, MAX_UINT256)
      expect(await veSDL.reward_pool()).to.eq(
        (await ethers.getContract("VeSDLRewards")).address,
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("create_lock", () => {
    it(`Reverts with reason string ${REVERT_MSG_ONLY_LOCK_FUTURE}`, async () => {
      await expect(
        veSDL.create_lock(BIG_NUMBER_1E18, await getCurrentBlockTimestamp()),
      ).to.be.revertedWith(REVERT_MSG_ONLY_LOCK_FUTURE)
    })

    it(`Creates a lock with max lock length (4 years)`, async () => {
      // Need manual timestamp setup to ensure no unexpected rounding happens
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )
      // After half of the lock time is past, balance should be half of the intial balance
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          LOCK_START_TIMESTAMP + MAXTIME / 2,
        ),
      ).to.eq("499999999940640000")
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          expireTimestamp,
        ),
      ).to.eq("0")
    })

    it(`Creates a lock with max lock length (4 years) expiring mid week`, async () => {
      // Test the case when the lock is applied mid week, which causes the expire timestamp to be rounded down in weeks interval
      // Sat Apr 25 2048 04:00:00 GMT+0000 (UTC)
      const LOCK_START_TIMESTAMP = 2362176000 + WEEK / 2
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      const roundedExpireTimestamp = expireTimestamp - (expireTimestamp % WEEK)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(
        roundedExpireTimestamp,
      )
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "996232876594056000",
      )
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          roundedExpireTimestamp,
        ),
      ).to.eq("0")
    })

    it(`Creates a lock with half-max length (2 years)`, async () => {
      // Sat Apr 25 2048 04:00:00 GMT+0000 (UTC)
      await setNextTimestamp(LOCK_START_TIMESTAMP + MAXTIME / 2)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "499999999940640000",
      )
      expect(
        await veSDL["balanceOf(address,uint256)"](
          deployerAddress,
          expireTimestamp,
        ),
      ).to.eq("0")
    })
  })

  describe("deposit_for", () => {
    it(`Reverts when depositing to an account with no existing lock`, async () => {
      await expect(
        veSDL.deposit_for(users[10], BIG_NUMBER_1E18),
      ).to.be.revertedWith(REVERT_MSG_NO_EXISTING_LOCK)
    })

    it(`Deposits to an account with an existing lock`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      // Send some sdl to user 10
      await sdl.transfer(users[10], BIG_NUMBER_1E18.mul(10_000_000))
      await sdl
        .connect(signers[10])
        .approve(veSDL.address, BIG_NUMBER_1E18.mul(10_000_000))

      // User 10 creates a lock for 4 years
      await veSDL
        .connect(signers[10])
        .create_lock(
          BIG_NUMBER_1E18.mul(10_000_000),
          LOCK_START_TIMESTAMP + MAXTIME,
        )
      expect(await veSDL["balanceOf(address)"](users[10])).to.eq(
        "9999999841451040048281068",
      )

      // Some time passes
      await setTimestamp(LOCK_START_TIMESTAMP + MAXTIME / 2)
      expect(await veSDL["balanceOf(address)"](users[10])).to.eq(
        "4999999999999999983552000",
      )

      // Deposit more for user 10
      await veSDL.deposit_for(users[10], BIG_NUMBER_1E18.mul(10_000_000))

      // Check balance has increased but by the amount of the total deposit scaled by the lock length
      expect(await veSDL["balanceOf(address)"](users[10])).to.eq(
        "9999999841451040048281068",
      )
      // Check user 10's lock expiray date has not changed
      expect(await veSDL.locked__end(users[10])).to.eq(
        LOCK_START_TIMESTAMP + MAXTIME,
      )
      expect(
        await veSDL["balanceOf(address,uint256)"](
          users[10],
          LOCK_START_TIMESTAMP + MAXTIME,
        ),
      ).to.eq(0)
    })
  })

  describe("force_withdraw", () => {
    it(`Successfully withdraws early from an account with an existing lock, paying 75% penalty`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )

      // After calling force_withdraw() early, check SDL balance has increased by quarter of the lock amount.
      const sdlBalanceBefore = await sdl.balanceOf(deployerAddress)
      await veSDL.force_withdraw()
      const sdlBalanceAfter = await sdl.balanceOf(deployerAddress)
      expect(sdlBalanceAfter.sub(sdlBalanceBefore)).to.eq(
        BIG_NUMBER_1E18.div(4),
      )
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq("0")
    })

    it(`Successfully withdraws early from an account with an existing lock, paying 50% penalty`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )

      // 2 years pass since the lock started
      await setNextTimestamp(LOCK_START_TIMESTAMP + MAXTIME / 2)

      // After calling force_withdraw() early, check SDL balance has increased by half of the lock amount.
      const sdlBalanceBefore = await sdl.balanceOf(deployerAddress)
      await veSDL.force_withdraw()
      const sdlBalanceAfter = await sdl.balanceOf(deployerAddress)
      expect(sdlBalanceAfter.sub(sdlBalanceBefore)).to.eq(
        BIG_NUMBER_1E18.div(2),
      )
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq("0")
    })
  })

  describe("withdraw", () => {
    it(`Reverts with message ${REVERT_MSG_TOO_EARLY_TO_UNLOCK}`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )

      // Withdraw before the lock expires
      await expect(veSDL.withdraw()).to.be.revertedWith(
        REVERT_MSG_TOO_EARLY_TO_UNLOCK,
      )
    })

    it(`Successfully withdraws early from an account when ve is unlocked`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )

      // admin unlocks ve
      await veSDL.set_funds_unlocked(true)

      // 2 years pass since the lock started
      await setNextTimestamp(LOCK_START_TIMESTAMP + MAXTIME / 2)

      // After calling withdraw() early, check SDL balance has increased by the deposit amount.
      const sdlBalanceBefore = await sdl.balanceOf(deployerAddress)
      await veSDL.withdraw()
      const sdlBalanceAfter = await sdl.balanceOf(deployerAddress)
      expect(sdlBalanceAfter.sub(sdlBalanceBefore)).to.eq(BIG_NUMBER_1E18)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq("0")
    })

    it(`Successfully withdraws after lock expires`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      const expireTimestamp = LOCK_START_TIMESTAMP + MAXTIME
      await veSDL.create_lock(BIG_NUMBER_1E18, expireTimestamp)

      expect(await veSDL.locked__end(deployerAddress)).to.eq(expireTimestamp)
      // After 1 second, the balance should be less than 1e18
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "999999999881280000",
      )

      // 4 years pass since the lock started
      await setTimestamp(LOCK_START_TIMESTAMP + MAXTIME)

      // After calling withdraw(), check SDL balance has increased by the deposit amount.
      const sdlBalanceBefore = await sdl.balanceOf(deployerAddress)
      await veSDL.withdraw()
      const sdlBalanceAfter = await sdl.balanceOf(deployerAddress)
      expect(sdlBalanceAfter.sub(sdlBalanceBefore)).to.eq(BIG_NUMBER_1E18)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq("0")
    })
  })

  describe("Use cases", () => {
    it(`Typical user`, async () => {
      await setNextTimestamp(LOCK_START_TIMESTAMP)

      // Creates a lock for 2 years
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        LOCK_START_TIMESTAMP + MAXTIME / 2,
      )

      // Frontend expected amount is slightly different from the actual amount
      // due to the difference in slope calculation. This is good enough since the
      // errors are marginal for UI display.
      const expectedLockAmount = calculateLockAmount(
        BIG_NUMBER_1E18.mul(10_000_000),
        await getCurrentBlockTimestamp(),
        LOCK_START_TIMESTAMP + MAXTIME / 2,
      )
      expect(expectedLockAmount).to.eq("4965753424657534246575342")

      // Actual veSDL amount
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "4965753424657534230240000",
      )

      // Expire timestamp is rounded in weeks when it is applied
      const roundedExpireTimestamp =
        Math.floor((LOCK_START_TIMESTAMP + MAXTIME / 2) / WEEK) * WEEK

      {
        const locked = await veSDL.locked(deployerAddress)
        expect(locked.amount).to.eq(BIG_NUMBER_1E18.mul(10_000_000))
        expect(locked.end).to.eq(roundedExpireTimestamp)
      }

      // 1 year passes, balance has decreased over time
      await setTimestamp(LOCK_START_TIMESTAMP + MAXTIME / 4)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "2465753424657534238464000",
      )

      // Increase amount
      await veSDL.increase_amount(BIG_NUMBER_1E18.mul(10_000_000))
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "4931506690766108558105068",
      )

      {
        const locked = await veSDL.locked(deployerAddress)
        expect(locked.amount).to.eq(BIG_NUMBER_1E18.mul(20_000_000))
        expect(locked.end).to.eq(roundedExpireTimestamp)
      }

      // Increase unlock time
      await veSDL.increase_unlock_time(LOCK_START_TIMESTAMP + MAXTIME)
      expect(await veSDL["balanceOf(address)"](deployerAddress)).to.eq(
        "14999999682902080113010136",
      )

      const locked = await veSDL.locked(deployerAddress)
      expect(locked.amount).to.eq(BIG_NUMBER_1E18.mul(20_000_000))
      expect(locked.end).to.eq(LOCK_START_TIMESTAMP + MAXTIME)
    })
  })
})
