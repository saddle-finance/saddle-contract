import { BigNumber, Signer } from "ethers"
import {
  MAX_UINT256,
  getCurrentBlockTimestamp,
  getUserTokenBalance,
  asyncForEach,
  getUserTokenBalances,
  TIME,
  setTimestamp,
  getPoolBalances,
  forceAdvanceOneBlock,
} from "./testUtils"
import { solidity } from "ethereum-waffle"

import { GenericERC20 } from "../build/typechain/GenericERC20"
import { LPToken } from "../build/typechain/LPToken"
import { Swap } from "../build/typechain/Swap"
import { SwapDeployer } from "../build/typechain/SwapDeployer"
import { SwapUtils } from "../build/typechain/SwapUtils"
import chai from "chai"
import { deployments } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("Swap Deployer", () => {
  let signers: Array<Signer>
  let swap: Swap
  let swapClone: Swap
  let swapDeployer: SwapDeployer
  let swapUtils: SwapUtils
  let DAI: GenericERC20
  let USDC: GenericERC20
  let USDT: GenericERC20
  let SUSD: GenericERC20
  let swapToken: LPToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let attacker: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string
  let swapStorage: {
    initialA: BigNumber
    futureA: BigNumber
    initialATime: BigNumber
    futureATime: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    lpToken: string
  }

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"
  const TOKENS: GenericERC20[] = []

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { get, deploy } = deployments
      await deployments.fixture() // ensure you start from a fresh deployments

      TOKENS.length = 0
      signers = await ethers.getSigners()
      owner = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      attacker = signers[10]
      ownerAddress = await owner.getAddress()
      user1Address = await user1.getAddress()
      user2Address = await user2.getAddress()

      await deploy("SUSD", {
        from: ownerAddress,
        contract: "GenericERC20",
        args: ["SUSD", "Synthetix USD", "18"],
        skipIfAlreadyDeployed: true,
      })

      DAI = await ethers.getContract("DAI")
      USDC = await ethers.getContract("USDC")
      USDT = await ethers.getContract("USDT")
      SUSD = await ethers.getContract("SUSD")

      TOKENS.push(DAI, USDC, USDT, SUSD)

      // Mint dummy tokens
      await asyncForEach(
        [ownerAddress, user1Address, user2Address, await attacker.getAddress()],
        async (address) => {
          await DAI.mint(address, String(1e20))
          await USDC.mint(address, String(1e8))
          await USDT.mint(address, String(1e8))
          await SUSD.mint(address, String(1e20))
        },
      )

      swap = await ethers.getContract("Swap")
      swapDeployer = await ethers.getContract("SwapDeployer")
      const lpToken = await ethers.getContract("LPToken")

      const swapCloneAddress = await swapDeployer.callStatic.deploy(
        swap.address,
        [DAI.address, USDC.address, USDT.address, SUSD.address],
        [18, 6, 6, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        lpToken.address,
      )

      await swapDeployer.deploy(
        swap.address,
        [DAI.address, USDC.address, USDT.address, SUSD.address],
        [18, 6, 6, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        lpToken.address,
      )

      swapClone = await ethers.getContractAt("Swap", swapCloneAddress)

      expect(await swapClone.getVirtualPrice()).to.be.eq(0)

      swapStorage = await swapClone.swapStorage()

      swapToken = (await ethers.getContractAt(
        "LPToken",
        swapStorage.lpToken,
      )) as LPToken

      await asyncForEach([owner, user1, user2, attacker], async (signer) => {
        await DAI.connect(signer).approve(swapClone.address, MAX_UINT256)
        await USDC.connect(signer).approve(swapClone.address, MAX_UINT256)
        await USDT.connect(signer).approve(swapClone.address, MAX_UINT256)
        await SUSD.connect(signer).approve(swapClone.address, MAX_UINT256)
      })

      // Populate the pool with initial liquidity
      await swapClone.addLiquidity(
        [String(50e18), String(50e6), String(50e6), String(50e18)],
        0,
        MAX_UINT256,
      )

      expect(await swapClone.getTokenBalance(0)).to.be.eq(String(50e18))
      expect(await swapClone.getTokenBalance(1)).to.be.eq(String(50e6))
      expect(await swapClone.getTokenBalance(2)).to.be.eq(String(50e6))
      expect(await swapClone.getTokenBalance(3)).to.be.eq(String(50e18))
      expect(await getUserTokenBalance(owner, swapToken)).to.be.eq(
        String(200e18),
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addLiquidity", () => {
    it("Add liquidity succeeds with pool with 4 tokens", async () => {
      const calcTokenAmount = await swapClone.calculateTokenAmount(
        [String(1e18), 0, 0, 0],
        true,
      )
      expect(calcTokenAmount).to.be.eq("999854620735777893")

      // Add liquidity as user1
      await swapClone
        .connect(user1)
        .addLiquidity(
          [String(1e18), 0, 0, 0],
          calcTokenAmount.mul(99).div(100),
          (await getCurrentBlockTimestamp()) + 60,
        )

      // Verify swapToken balance
      expect(await swapToken.balanceOf(await user1.getAddress())).to.be.eq(
        "999355335447632820",
      )
    })
  })

  describe("swap", () => {
    it("Swap works between tokens with different decimals", async () => {
      const calcTokenAmount = await swapClone
        .connect(user1)
        .calculateSwap(2, 0, String(1e6))
      expect(calcTokenAmount).to.be.eq("998608238366733809")
      const DAIBefore = await getUserTokenBalance(user1, DAI)
      await swapClone
        .connect(user1)
        .swap(
          2,
          0,
          String(1e6),
          calcTokenAmount,
          (await getCurrentBlockTimestamp()) + 60,
        )
      const DAIAfter = await getUserTokenBalance(user1, DAI)

      // Verify user1 balance changes
      expect(DAIAfter.sub(DAIBefore)).to.be.eq("998608238366733809")

      // Verify pool balance changes
      expect(await swapClone.getTokenBalance(0)).to.be.eq(
        "49001391761633266191",
      )
    })
  })

  describe("removeLiquidity", () => {
    it("Remove Liquidity succeeds", async () => {
      const calcTokenAmount = await swapClone.calculateTokenAmount(
        [String(1e18), 0, 0, 0],
        true,
      )
      expect(calcTokenAmount).to.be.eq("999854620735777893")

      // Add liquidity (1e18 DAI) as user1
      await swapClone
        .connect(user1)
        .addLiquidity(
          [String(1e18), 0, 0, 0],
          calcTokenAmount.mul(99).div(100),
          (await getCurrentBlockTimestamp()) + 60,
        )

      // Verify swapToken balance
      expect(await swapToken.balanceOf(await user1.getAddress())).to.be.eq(
        "999355335447632820",
      )

      // Calculate expected amounts of tokens user1 will receive
      const expectedAmounts = await swapClone.calculateRemoveLiquidity(
        "999355335447632820",
      )

      expect(expectedAmounts[0]).to.be.eq("253568584947798923")
      expect(expectedAmounts[1]).to.be.eq("248596")
      expect(expectedAmounts[2]).to.be.eq("248596")
      expect(expectedAmounts[3]).to.be.eq("248596651909606787")

      // Allow burn of swapToken
      await swapToken
        .connect(user1)
        .approve(swapClone.address, "999355335447632820")
      const beforeTokenBalances = await getUserTokenBalances(user1, TOKENS)

      // Withdraw user1's share via all tokens in proportion to pool's balances
      await swapClone
        .connect(user1)
        .removeLiquidity(
          "999355335447632820",
          expectedAmounts,
          (await getCurrentBlockTimestamp()) + 60,
        )

      const afterTokenBalances = await getUserTokenBalances(user1, TOKENS)

      // Verify the received amounts are correct
      expect(afterTokenBalances[0].sub(beforeTokenBalances[0])).to.be.eq(
        "253568584947798923",
      )
      expect(afterTokenBalances[1].sub(beforeTokenBalances[1])).to.be.eq(
        "248596",
      )
      expect(afterTokenBalances[2].sub(beforeTokenBalances[2])).to.be.eq(
        "248596",
      )
      expect(afterTokenBalances[3].sub(beforeTokenBalances[3])).to.be.eq(
        "248596651909606787",
      )
    })
  })

  describe("Check for timestamp manipulations", () => {
    beforeEach(async () => {
      await forceAdvanceOneBlock()
    })
    it("Check for maximum differences in A and virtual price when increasing", async () => {
      // Create imbalanced pool to measure virtual price change
      // Number of tokens are in 2:1:1:1 ratio
      // We expect virtual price to increase as A increases
      await swapClone
        .connect(user1)
        .addLiquidity([String(1e20), 0, 0, 0], 0, MAX_UINT256)

      // Start ramp
      await swapClone.rampA(
        100,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // +0 seconds since ramp A
      expect(await swapClone.getA()).to.be.eq(50)
      expect(await swapClone.getAPrecise()).to.be.eq(5000)
      expect(await swapClone.getVirtualPrice()).to.be.eq("1000166120891616093")

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      // +900 seconds since ramp A
      expect(await swapClone.getA()).to.be.eq(50)
      expect(await swapClone.getAPrecise()).to.be.eq(5003)
      expect(await swapClone.getVirtualPrice()).to.be.eq("1000168045277768276")

      // Max change of A between two blocks
      // 5003 / 5000
      // = 1.0006

      // Max change of virtual price between two blocks
      // 1000168045277768276 / 1000166120891616093
      // = 1.00000192407
    })

    it("Check for maximum differences in A and virtual price when decreasing", async () => {
      // Create imbalanced pool to measure virtual price change
      // Number of tokens are in 2:1:1:1 ratio
      // We expect virtual price to decrease as A decreases
      await swapClone
        .connect(user1)
        .addLiquidity([String(1e20), 0, 0, 0], 0, MAX_UINT256)

      // Start ramp
      await swapClone.rampA(
        25,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // +0 seconds since ramp A
      expect(await swapClone.getA()).to.be.eq(50)
      expect(await swapClone.getAPrecise()).to.be.eq(5000)
      expect(await swapClone.getVirtualPrice()).to.be.eq("1000166120891616093")

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      // +900 seconds since ramp A
      expect(await swapClone.getA()).to.be.eq(49)
      expect(await swapClone.getAPrecise()).to.be.eq(4999)
      expect(await swapClone.getVirtualPrice()).to.be.eq("1000165478934301535")

      // Max change of A between two blocks
      // 4999 / 5000
      // = 0.9998

      // Max change of virtual price between two blocks
      // 1000165478934301535 / 1000166120891616093
      // = 0.99999935814
    })

    // Below tests try to verify the issues found in Curve Vulnerability Report are resolved.
    // https://medium.com/@peter_4205/curve-vulnerability-report-a1d7630140ec
    // The two cases we are most concerned are:
    //
    // 1. A is ramping up, and the pool is at imbalanced state.
    //
    // Attacker can 'resolve' the imbalance prior to the change of A. Then try to recreate the imbalance after A has
    // changed. Due to the price curve becoming more linear, recreating the imbalance will become a lot cheaper. Thus
    // benefiting the attacker.
    //
    // 2. A is ramping down, and the pool is at balanced state
    //
    // Attacker can create the imbalance in token balances prior to the change of A. Then try to resolve them
    // near 1:1 ratio. Since downward change of A will make the price curve less linear, resolving the token balances
    // to 1:1 ratio will be cheaper. Thus benefiting the attacker
    //
    // For visual representation of how price curves differ based on A, please refer to Figure 1 in the above
    // Curve Vulnerability Report.

    describe("Check for attacks while A is ramping upwards", () => {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []

      beforeEach(async () => {
        initialAttackerBalances = await getUserTokenBalances(attacker, TOKENS)

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
        expect(initialAttackerBalances[1]).to.be.eq(String(1e8))
        expect(initialAttackerBalances[2]).to.be.eq(String(1e8))
        expect(initialAttackerBalances[3]).to.be.eq(String(1e20))

        // Start ramp upwards
        await swapClone.rampA(
          100,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await swapClone.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = await getPoolBalances(swapClone, 4)
        expect(initialPoolBalances[0]).to.be.eq(String(50e18))
        expect(initialPoolBalances[1]).to.be.eq(String(50e6))
        expect(initialPoolBalances[2]).to.be.eq(String(50e6))
        expect(initialPoolBalances[3]).to.be.eq(String(50e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          // This attack is achieved by creating imbalance in the first block then
          // trading in reverse direction in the second block.

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 16e6 of USDC to SUSD, causing massive imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(16e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 15.87e18 of SUSD
            expect(SUSDOutput).to.be.eq("15873636661935380627")

            // Pool is imbalanced! Now trades from SUSD -> USDC may be profitable in small sizes
            // USDC balance in the pool : 66e6
            // SUSD balance in the pool : 34.13e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(66e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "34126363338064619373",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await swapClone.getAPrecise()).to.be.eq(5003)

            // Trade SUSD to USDC, taking advantage of the imbalance and change of A
            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 16e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("15967909")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("32091")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 3.209e4 USDC (0.201% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "32091",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 3.209e4 USDC (0.0642% of USDC balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 16e6 of USDC to SUSD, causing massive imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(16e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 15.87e18 of SUSD
            expect(SUSDOutput).to.be.eq("15873636661935380627")

            // Pool is imbalanced! Now trades from SUSD -> USDC may be profitable in small sizes
            // USDC balance in the pool : 66e6
            // SUSD balance in the pool : 34.13e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(66e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "34126363338064619373",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await swapClone.getAPrecise()).to.be.eq(10000)

            // Trade SUSD to USDC, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 16e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("15913488")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("86512")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 8.65e4 USDC (0.54% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "86512",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 8.65e4 USDC (0.173024% of USDC balance)
            // The attack did not benefit the attacker.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          // This attack is achieved by attempting to resolve the imbalance by getting as close to 1:1 ratio of tokens.
          // Then re-creating the imbalance when A has changed.

          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await swapClone
              .connect(user2)
              .addLiquidity(
                [0, 0, 0, String(50e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
              )

            // Check current pool balances
            initialPoolBalances = await getPoolBalances(swapClone, 4)
            expect(initialPoolBalances[0]).to.be.eq(String(50e18))
            expect(initialPoolBalances[1]).to.be.eq(String(50e6))
            expect(initialPoolBalances[2]).to.be.eq(String(50e6))
            expect(initialPoolBalances[3]).to.be.eq(String(100e18))
          })

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swapping 25e6 of USDC to SUSD, resolving imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(25e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 25.14e18 of SUSD
            // Because the pool was imbalanced in the beginning, this trade results in more than 25e18 SUSD
            expect(SUSDOutput).to.be.eq("25140480043410581418")

            // Pool is now almost balanced!
            // USDC balance in the pool : 75.00e6
            // SUSD balance in the pool : 74.86e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(75e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "74859519956589418582",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await swapClone.getAPrecise()).to.be.eq(5003)

            // Trade SUSD to USDC, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 25e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("24950174")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("49826")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 4.982e4 USDC (0.199% of initial attack deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "49826",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 4.982e4 USDC (0.0996% of USDC balance of pool)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 25e6 of USDC to SUSD, resolving the imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(25e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 25.14e18 of SUSD
            expect(SUSDOutput).to.be.eq("25140480043410581418")

            // Pool is now almost balanced!
            // USDC balance in the pool : 75.00e6
            // SUSD balance in the pool : 74.86e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(75e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "74859519956589418582",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await swapClone.getAPrecise()).to.be.eq(10000)

            // Trade SUSD to USDC, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 25e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("25031387")
            // Attack was successful!

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            expect(initialAttackerBalances[1]).to.be.lt(
              finalAttackerBalances[1],
            )
            expect(initialAttackerBalances[3]).to.be.eq(
              finalAttackerBalances[3],
            )
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("31387")
            expect(
              finalAttackerBalances[3].sub(initialAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker gained 3.139e4 USDC (0.12556% of attack deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.lt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "31387",
            )
            expect(initialPoolBalances[3].sub(finalPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 3.139e4 USDC (0.06278% of USDC balance in pool)

            // The attack benefited the attacker.
            // Note that this attack is only possible when there are no swaps happening during the 2 weeks ramp period.
          })
        },
      )
    })

    describe("Check for attacks while A is ramping downwards", () => {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []

      beforeEach(async () => {
        // Set up the downward ramp A
        initialAttackerBalances = await getUserTokenBalances(attacker, TOKENS)

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
        expect(initialAttackerBalances[1]).to.be.eq(String(1e8))
        expect(initialAttackerBalances[2]).to.be.eq(String(1e8))
        expect(initialAttackerBalances[3]).to.be.eq(String(1e20))

        // Start ramp downwards
        await swapClone.rampA(
          25,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await swapClone.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = await getPoolBalances(swapClone, 4)
        expect(initialPoolBalances[0]).to.be.eq(String(50e18))
        expect(initialPoolBalances[1]).to.be.eq(String(50e6))
        expect(initialPoolBalances[2]).to.be.eq(String(50e6))
        expect(initialPoolBalances[3]).to.be.eq(String(50e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          // This attack is achieved by creating imbalance in the first block then
          // trading in reverse direction in the second block.

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 16e6 of USDC to SUSD, causing massive imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(16e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 15.87e18 of SUSD
            expect(SUSDOutput).to.be.eq("15873636661935380627")

            // Pool is imbalanced! Now trades from SUSD -> USDC may be profitable in small sizes
            // USDC balance in the pool : 66e6
            // SUSD balance in the pool : 34.13e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(66e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "34126363338064619373",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await swapClone.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 16e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("15967995")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            // Check for attacker's balance changes
            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("32005")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 3.2e4 USDC (0.2% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "32005",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 3.2e4 USDC (0.064% of USDC pool balance)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test is to show how dangerous rapid A ramp is.

            // Swap 16e6 USDC to sUSD, causing imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(16e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 15.87e18 of SUSD
            expect(SUSDOutput).to.be.eq("15873636661935380627")

            // Pool is imbalanced! Now trades from SUSD -> USDC may be profitable in small sizes
            // USDC balance in the pool : 66e6
            // SUSD balance in the pool : 34.13e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(66e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "34126363338064619373",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await swapClone.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 16e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("16073391")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            // Check for attacker's balance changes
            expect(finalAttackerBalances[1]).to.be.gt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("73391")
            expect(
              finalAttackerBalances[3].sub(initialAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker gained 7.34e4 USDC (0.45875% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.lt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "73391",
            )
            expect(initialPoolBalances[3].sub(finalPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 7.34e4 USDC (0.1468% of USDC balance)

            // The attack was successful. The change of A (-50%) gave the attacker a chance to swap
            // more efficiently. The swap fee (0.1%) was not sufficient to counter the efficient trade, giving
            // the attacker more tokens than initial deposit.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          // This attack is achieved by attempting to resolve the imbalance by getting as close to 1:1 ratio of tokens.
          // Then re-creating the imbalance when A has changed.

          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await swapClone
              .connect(user2)
              .addLiquidity(
                [0, 0, 0, String(50e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
              )

            // Check current pool balances
            initialPoolBalances = await getPoolBalances(swapClone, 4)
            expect(initialPoolBalances[0]).to.be.eq(String(50e18))
            expect(initialPoolBalances[1]).to.be.eq(String(50e6))
            expect(initialPoolBalances[2]).to.be.eq(String(50e6))
            expect(initialPoolBalances[3]).to.be.eq(String(100e18))
          })

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 25e6 of USDC to SUSD, resolving imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(25e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 25.14e18 of SUSD
            // Because the pool was imbalanced in the beginning, this trade results in more than 25e18 SUSD
            expect(SUSDOutput).to.be.eq("25140480043410581418")

            // Pool is now almost balanced!
            // USDC balance in the pool : 75.00e6
            // SUSD balance in the pool : 74.86e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(75e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "74859519956589418582",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await swapClone.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 25e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("24950046")

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            // Check for attacker's balance changes
            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("49954")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 4.995e4 USDC (0.2% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "49954",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.22e6 USDC (0.1% of pool balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test case is to mimic rapid ramp down of A.

            // Swap 25e6 of USDC to SUSD, resolving imbalance in the pool
            await swapClone
              .connect(attacker)
              .swap(1, 3, String(25e6), 0, MAX_UINT256)
            const SUSDOutput = (await getUserTokenBalance(attacker, SUSD)).sub(
              initialAttackerBalances[3],
            )

            // First trade results in 25.14e18 of SUSD
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 SUSD
            expect(SUSDOutput).to.be.eq("25140480043410581418")

            // Pool is now almost balanced!
            // USDC balance in the pool : 75.00e6
            // SUSD balance in the pool : 74.86e18
            expect(await swapClone.getTokenBalance(1)).to.be.eq(String(75e6))
            expect(await swapClone.getTokenBalance(3)).to.be.eq(
              "74859519956589418582",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await swapClone.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(attacker, USDC)
            await swapClone
              .connect(attacker)
              .swap(3, 1, SUSDOutput, 0, MAX_UINT256)
            const USDCOutput = (await getUserTokenBalance(attacker, USDC)).sub(
              balanceBefore,
            )

            // If USDCOutput > 25e6, the attacker leaves with more USDC than the start.
            expect(USDCOutput).to.be.eq("24794844")
            // Attack was not successful

            const finalAttackerBalances = await getUserTokenBalances(
              attacker,
              TOKENS,
            )

            // Check for attacker's balance changes
            expect(finalAttackerBalances[1]).to.be.lt(
              initialAttackerBalances[1],
            )
            expect(finalAttackerBalances[3]).to.be.eq(
              initialAttackerBalances[3],
            )
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("205156")
            expect(
              initialAttackerBalances[3].sub(finalAttackerBalances[3]),
            ).to.be.eq("0")
            // Attacker lost 2.05e5 USDC (0.820624% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = await getPoolBalances(swapClone, 4)

            expect(finalPoolBalances[1]).to.be.gt(initialPoolBalances[1])
            expect(finalPoolBalances[3]).to.be.eq(initialPoolBalances[3])
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "205156",
            )
            expect(finalPoolBalances[3].sub(initialPoolBalances[3])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 2.05e5 USDC (0.410312% of USDC balance of pool)
            // The attack did not benefit the attacker
          })
        },
      )
    })
  })
})
