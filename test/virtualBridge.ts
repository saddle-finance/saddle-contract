import { BigNumber, Signer, utils, Wallet } from "ethers"
import {
  asyncForEach,
  deployContractWithLibraries,
  getTestMerkleProof,
  getTestMerkleRoot,
  getUserTokenBalances,
  impersonateAccount,
  increaseTimestamp,
  MAX_UINT256,
  revertToSnapshot,
  setTimestamp,
  takeSnapshot,
  ZERO_ADDRESS,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { Bridge } from "../build/typechain/Bridge"
import BridgeArtifact from "../build/artifacts/contracts/VirtualSwap/Bridge.sol/Bridge.json"
import { GenericERC20 } from "../build/typechain/GenericERC20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { LPToken } from "../build/typechain/LPToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import chai from "chai"
import { ethers, network } from "hardhat"

import dotenv from "dotenv"

dotenv.config()
chai.use(solidity)
const { expect } = chai

const INITIAL_A_VALUE = 50
const SWAP_FEE = 4e6
const LP_TOKEN_NAME = "Test LP Token Name"
const LP_TOKEN_SYMBOL = "TESTLP"

describe("Virtual swap bridge [ @skip-on-coverage ]", () => {
  let signers: Array<Signer>
  let bridge: Bridge
  let btcSwap: Swap
  let usdSwap: Swap
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let wbtc: GenericERC20
  let renbtc: GenericERC20
  let sbtc: GenericERC20
  let tbtc: GenericERC20
  let susd: GenericERC20
  let sdefi: GenericERC20
  let usdc: GenericERC20
  let btcSwapToken: LPToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let savedStateId = -1
  // eslint-disable-next-line no-unused-vars
  let ownerAddress: string
  // eslint-disable-next-line no-unused-vars
  let user1Address: string
  // eslint-disable-next-line no-unused-vars
  let user2Address: string
  let btcSwapStorage: {
    initialA: BigNumber
    futureA: BigNumber
    initialATime: BigNumber
    futureATime: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    lpToken: string
  }

  interface TokensListInterface {
    [K: string]: {
      address: string
      holders: string[]
      contract: any
    }
  }

  const tokenList: TokensListInterface = {
    tbtc: {
      address: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
      holders: ["0xf9e11762d522ea29dd78178c9baf83b7b093aacc"],
      contract: null,
    },
    wbtc: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      holders: ["0x875abe6f1e2aba07bed4a3234d8555a0d7656d12"],
      contract: null,
    },
    renbtc: {
      address: "0xeb4c2781e4eba804ce9a9803c67d0893436bb27d",
      holders: [
        "0xf8c42927a60cbd4a536ce24ef8bed00b16a9b44b",
        "0x4706349cF2ca0FF95Bf914e28ed42AD3456d6429",
      ],
      contract: null,
    },
    sbtc: {
      address: "0xfe18be6b3bd88a2d2a7f928d00292e7a9963cfc6",
      holders: [
        "0x3cacdfa0ad9f144f80fa251e37de54028c8424a4",
        "0xf671284D1F3f4b3bd4BEc0959A23e7c5dB4A62C3",
      ],
      contract: null,
    },
    susd: {
      address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
      holders: ["0xC8C2b727d864CC75199f5118F0943d2087fB543b"],
      contract: null,
    },
    usdc: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      holders: ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8"],
      contract: null,
    },
    sdefi: {
      address: "0xe1aFe1Fd76Fd88f78cBf599ea1846231B8bA3B6B",
      holders: ["0x89b76bddA22a59014E7C67A612ca80DAD957e13d"],
      contract: null,
    },
  }

  // fork mainnet
  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ALCHEMY_API,
            blockNumber: 11598050,
          },
        },
      ],
    })

    await setTimestamp(1609896169)
  })

  beforeEach(async () => {
    // reset to snapshot
    if (savedStateId > -1) {
      await revertToSnapshot(savedStateId)
    }
    savedStateId = await takeSnapshot()

    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    ownerAddress = await owner.getAddress()
    user1Address = await user1.getAddress()
    user2Address = await user2.getAddress()

    // Take tokens from the holders by impersonating them
    // eslint-disable-next-line no-unused-vars
    for (const [k, v] of Object.entries(tokenList)) {
      const contract = (await ethers.getContractAt(
        GenericERC20Artifact.abi,
        v.address,
      )) as GenericERC20

      await asyncForEach(v.holders, async (holder) => {
        await contract
          .connect(await impersonateAccount(holder))
          .transfer(user1Address, await contract.balanceOf(holder))
      })

      v.contract = contract
    }

    tbtc = tokenList.tbtc.contract
    wbtc = tokenList.wbtc.contract
    renbtc = tokenList.renbtc.contract
    sbtc = tokenList.sbtc.contract
    susd = tokenList.susd.contract
    sdefi = tokenList.sdefi.contract
    usdc = tokenList.usdc.contract

    const balances = await getUserTokenBalances(user1Address, [
      tbtc,
      wbtc,
      renbtc,
      sbtc,
      susd,
      usdc,
    ])

    expect(balances[0]).to.eq("72953806919870472431")
    expect(balances[1]).to.eq("90380233073")
    expect(balances[2]).to.eq("32765116441")
    expect(balances[3]).to.eq("46220887120771774898")
    expect(balances[4]).to.eq("6559142099847758949166311")
    expect(balances[5]).to.eq("315600946507951")

    // Deploy Allowlist
    allowlist = (await deployContract(signers[0] as Wallet, AllowlistArtifact, [
      getTestMerkleRoot(),
    ])) as Allowlist

    // Deploy MathUtils
    mathUtils = (await deployContract(
      signers[0] as Wallet,
      MathUtilsArtifact,
    )) as MathUtils

    // Deploy SwapUtils with MathUtils library
    swapUtils = (await deployContractWithLibraries(owner, SwapUtilsArtifact, {
      MathUtils: mathUtils.address,
    })) as SwapUtils
    await swapUtils.deployed()

    // Deploy Swap with SwapUtils library
    btcSwap = (await deployContractWithLibraries(
      owner,
      SwapArtifact,
      { SwapUtils: swapUtils.address },
      [
        [
          tokenList.tbtc.address,
          tokenList.wbtc.address,
          tokenList.renbtc.address,
          tokenList.sbtc.address,
        ],
        [18, 8, 8, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        0,
        allowlist.address,
      ],
    )) as Swap
    await btcSwap.deployed()
    btcSwapStorage = await btcSwap.swapStorage()

    btcSwapToken = (await ethers.getContractAt(
      LPTokenArtifact.abi,
      btcSwapStorage.lpToken,
    )) as LPToken

    usdSwap = (await deployContractWithLibraries(
      owner,
      SwapArtifact,
      { SwapUtils: swapUtils.address },
      [
        [tokenList.susd.address, tokenList.usdc.address],
        [18, 6],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        0,
        allowlist.address,
      ],
    )) as Swap

    // Deploy Bridge contract
    bridge = (await deployContract(owner, BridgeArtifact)) as Bridge
    await bridge.deployed()

    // Set deposit limits
    await allowlist.setPoolCap(btcSwap.address, BigNumber.from(10).pow(24))
    await allowlist.setPoolAccountLimit(
      btcSwap.address,
      BigNumber.from(10).pow(24),
    )
    await allowlist.setPoolCap(usdSwap.address, BigNumber.from(10).pow(18 + 10))
    await allowlist.setPoolAccountLimit(
      usdSwap.address,
      BigNumber.from(10).pow(18 + 10),
    )

    // Approve token transfer to Swap for adding liquidity and to Bridge for virtual swaps
    await asyncForEach(
      [tbtc, wbtc, renbtc, sbtc, susd, sdefi, usdc],
      async (t: GenericERC20) => {
        await t.connect(user1).approve(btcSwap.address, MAX_UINT256)
        await t.connect(user1).approve(usdSwap.address, MAX_UINT256)
        await t.connect(user1).approve(bridge.address, MAX_UINT256)
      },
    )

    // Add initial liquidity
    await btcSwap
      .connect(user1)
      .addLiquidity(
        [String(45e18), String(45e8), String(45e8), String(45e18)],
        0,
        MAX_UINT256,
        getTestMerkleProof(user1Address),
      )

    await usdSwap
      .connect(user1)
      .addLiquidity(
        [
          BigNumber.from(String(1e18)).mul(5000000),
          BigNumber.from(String(1e6)).mul(5000000),
        ],
        0,
        MAX_UINT256,
        getTestMerkleProof(user1Address),
      )

    expect(await btcSwapToken.balanceOf(user1Address)).to.eq(String(180e18))
  })

  describe("setSynthIndex", () => {
    it("Emits SynthIndex event", async () => {
      await expect(
        bridge.setSynthIndex(
          btcSwap.address,
          3,
          utils.formatBytes32String("sBTC"),
        ),
      ).to.emit(bridge, "SynthIndex")
    })

    it("Succeeds with correct currencyKey", async () => {
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)
    })

    it("Reverts when currencyKey do not match", async () => {
      await expect(
        bridge.setSynthIndex(
          btcSwap.address,
          3,
          utils.formatBytes32String("sDEFI"),
        ),
      ).to.be.reverted
    })

    it("Reverts when given index is not a synth", async () => {
      await expect(
        bridge.setSynthIndex(
          btcSwap.address,
          1,
          utils.formatBytes32String("sBTC"),
        ),
      ).to.be.reverted
    })
  })

  describe("calcTokenToSynth", () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)
    })

    it("Succeeds to calculate wBTC -> sUSD", async () => {
      const expectedReturnAmount = await bridge.calcTokenToSynth(
        btcSwap.address,
        await btcSwap.getTokenIndex(wbtc.address),
        utils.formatBytes32String("sUSD"),
        String(0.01e8),
      )

      // 0.01 wBTC -> 339.43044953 sUSD
      expect(expectedReturnAmount).to.eq("339899620423006524397")
    })

    it("Succeeds to calculate wBTC -> sDEFI", async () => {
      const expectedReturnAmount = await bridge.calcTokenToSynth(
        btcSwap.address,
        await btcSwap.getTokenIndex(wbtc.address),
        utils.formatBytes32String("sDEFI"),
        String(0.01e8),
      )

      // sDEFI @ 5019.88196177 sUSD
      // 0.01 wBTC -> 0.06761721732 sDEFI
      expect(expectedReturnAmount).to.eq("67710679857235017")
    })
  })

  describe("tokenToSynth", () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)
    })

    it("Succeeds to swap wBTC -> vsUSD -> settled to sUSD", async () => {
      const wbtcIndex = await btcSwap.getTokenIndex(wbtc.address)

      // Calculate expected amounts
      const expectedReturnAmount = await bridge.calcTokenToSynth(
        btcSwap.address,
        wbtcIndex,
        utils.formatBytes32String("sUSD"),
        String(0.01e8),
      )

      // 0.01 wBTC -> 339.43044953 sUSD
      expect(expectedReturnAmount).to.eq("339899620423006524397")

      // Initiate tokenToSynth
      const queueId = await bridge
        .connect(user1)
        .callStatic.tokenToSynth(
          btcSwap.address,
          wbtcIndex,
          utils.formatBytes32String("sUSD"),
          String(0.01e8),
          expectedReturnAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await (
        await bridge
          .connect(user1)
          .tokenToSynth(
            btcSwap.address,
            wbtcIndex,
            utils.formatBytes32String("sUSD"),
            String(0.01e8),
            expectedReturnAmount.mul(99).div(100),
            ZERO_ADDRESS,
          )
      ).wait()

      const sUSDBalanceBefore = await susd.balanceOf(user1Address)

      // Wait for settle period
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(360)
      await increaseTimestamp(360)
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(0)

      // Settle virtual synth
      await (await bridge.settle(queueId)).wait()

      // Check synth balance
      const sUSDBalanceAfter = await susd.balanceOf(user1Address)
      expect(sUSDBalanceAfter.sub(sUSDBalanceBefore)).to.eq(
        "338879921561737504823",
      )
    })

    it("Succeeds to swap wBTC -> vsDEFI -> settle to sDEFI", async () => {
      const wbtcIndex = await btcSwap.getTokenIndex(wbtc.address)

      const expectedReturnAmount = await bridge.calcTokenToSynth(
        btcSwap.address,
        wbtcIndex,
        utils.formatBytes32String("sDEFI"),
        String(0.01e8),
      )

      // sDEFI @ 5019.88196177 sUSD
      // 0.01 wBTC -> 0.06761721732 sDEFI
      expect(expectedReturnAmount).to.eq("67710679857235017")

      // Initiate tokenToSynth
      const queueId = await bridge
        .connect(user1)
        .callStatic.tokenToSynth(
          btcSwap.address,
          wbtcIndex,
          utils.formatBytes32String("sDEFI"),
          String(0.01e8),
          expectedReturnAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await (
        await bridge
          .connect(user1)
          .tokenToSynth(
            btcSwap.address,
            wbtcIndex,
            utils.formatBytes32String("sDEFI"),
            String(0.01e8),
            expectedReturnAmount.mul(99).div(100),
            ZERO_ADDRESS,
          )
      ).wait()

      expect(queueId).to.eq("0")

      // Wait for settle period
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(360)
      await increaseTimestamp(360)
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(0)
      const sDEFIBalanceBefore = await sdefi.balanceOf(user1Address)

      // Settle virtual synth
      await (await bridge.settle(queueId)).wait()

      // Check synth balance
      const sDEFIBalanceAfter = await sdefi.balanceOf(user1Address)
      expect(sDEFIBalanceAfter.sub(sDEFIBalanceBefore)).to.eq(
        "67033573058662666",
      )
    })

    it("Reverts when minAmount is not reached", async () => {
      // Initiate tokenToSynth with max uint value as the minAmount parameter
      await expect(
        bridge
          .connect(user1)
          .tokenToSynth(
            btcSwap.address,
            await btcSwap.getTokenIndex(wbtc.address),
            utils.formatBytes32String("sUSD"),
            String(0.01e8),
            MAX_UINT256,
            ZERO_ADDRESS,
          ),
      ).to.be.reverted
    })
  })

  describe("calcSynthToToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)
    })

    it("Succeeds to calculate sUSD -> tBTC", async () => {
      const expectedVirtualTokenAmount = await bridge.calcSynthToToken(
        btcSwap.address,
        utils.formatBytes32String("sUSD"),
        await btcSwap.getTokenIndex(tbtc.address),
        BigNumber.from(50000).mul(String(1e18)),
      )

      // 50000 sUSD -> 1.468897 tBTC
      expect(expectedVirtualTokenAmount).to.eq("1468897441660230103")
    })

    it("Succeeds to calculate sDEFI -> tBTC", async () => {
      const expectedVirtualTokenAmount = await bridge.calcSynthToToken(
        btcSwap.address,
        utils.formatBytes32String("sDEFI"),
        await btcSwap.getTokenIndex(tbtc.address),
        BigNumber.from(15).mul(String(1e18)),
      )

      // 15 sDEFI -> 2.211387 tBTC
      expect(expectedVirtualTokenAmount).to.eq("2211387595574030393")
    })
  })

  describe("synthToToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)
    })

    it("Succeeds to swap sUSD -> vtBTC -> settle to tBTC", async () => {
      const tbtcIndex = await btcSwap.getTokenIndex(tbtc.address)

      const expectedVirtualTokenAmount = await bridge.calcSynthToToken(
        btcSwap.address,
        utils.formatBytes32String("sUSD"),
        tbtcIndex,
        BigNumber.from(50000).mul(String(1e18)),
      )

      // 50000 sUSD -> 1.468897 tBTC
      expect(expectedVirtualTokenAmount).to.eq("1468897441660230103")

      const queueId = await bridge
        .connect(user1)
        .callStatic.synthToToken(
          btcSwap.address,
          utils.formatBytes32String("sUSD"),
          tbtcIndex,
          BigNumber.from(50000).mul(String(1e18)),
          expectedVirtualTokenAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await bridge
        .connect(user1)
        .synthToToken(
          btcSwap.address,
          utils.formatBytes32String("sUSD"),
          tbtcIndex,
          BigNumber.from(50000).mul(String(1e18)),
          expectedVirtualTokenAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      // On an actual network, the front-end should parse the logs to retrieve the queueId
      expect(queueId).to.eq("0")

      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(360)
      await increaseTimestamp(360)
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(0)

      const tBTCAmountBefore = await tbtc.balanceOf(user1Address)
      await bridge.settle(queueId)
      const tBTCAmountAfter = await tbtc.balanceOf(user1Address)

      expect(tBTCAmountAfter.sub(tBTCAmountBefore)).to.eq("1464493571116930502")
    })
  })

  describe("calcTokenToToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)

      await bridge.setSynthIndex(
        usdSwap.address,
        0,
        utils.formatBytes32String("sUSD"),
      )
      expect(await bridge.getSynthIndex(usdSwap.address)).to.eq(0)
    })

    it("Succeeds to calculate tBTC -> sBTC -> sUSD -> USDC", async () => {
      const expectedTokenAmounts = await bridge.calcTokenToToken(
        [btcSwap.address, usdSwap.address],
        0,
        1,
        BigNumber.from(String(1e18)).mul(10),
      )

      // 10 tBTC -> 337,768 USDC
      expect(expectedTokenAmounts[1]).to.eq("337768257810")
    })

    it("Succeeds to calculate USDC -> sUSD -> sBTC -> WBTC", async () => {
      const expectedTokenAmounts = await bridge.calcTokenToToken(
        [usdSwap.address, btcSwap.address],
        1,
        1,
        BigNumber.from(String(1e6)).mul(337768),
      )

      // 337,768 USDC -> 9.867 WBTC
      expect(expectedTokenAmounts[1]).to.eq("986742649")
    })
  })

  describe("tokenToToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        btcSwap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(btcSwap.address)).to.eq(3)

      await bridge.setSynthIndex(
        usdSwap.address,
        0,
        utils.formatBytes32String("sUSD"),
      )
      expect(await bridge.getSynthIndex(usdSwap.address)).to.eq(0)
    })

    it("Succeeds to swap tBTC -> sBTC -> sUSD -> USDC", async () => {
      const expectedTokenAmounts = await bridge.calcTokenToToken(
        [btcSwap.address, usdSwap.address],
        0,
        1,
        BigNumber.from(String(1e18)).mul(10),
      )

      // 10 tBTC -> 337,768 USDC
      expect(expectedTokenAmounts[1]).to.eq("337768257810")

      const queueId = await bridge
        .connect(user1)
        .callStatic.tokenToToken(
          [btcSwap.address, usdSwap.address],
          0,
          1,
          BigNumber.from(String(1e18)).mul(10),
          [
            expectedTokenAmounts[0].mul(99).div(100),
            expectedTokenAmounts[1].mul(99).div(100),
          ],
          ZERO_ADDRESS,
        )

      await bridge
        .connect(user1)
        .tokenToToken(
          [btcSwap.address, usdSwap.address],
          0,
          1,
          BigNumber.from(String(1e18)).mul(10),
          [
            expectedTokenAmounts[0].mul(99).div(100),
            expectedTokenAmounts[1].mul(99).div(100),
          ],
          ZERO_ADDRESS,
        )

      // On an actual network, the front-end should parse the logs to retrieve the queueId
      expect(queueId).to.eq("0")

      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(360)
      await increaseTimestamp(360)
      expect(await bridge.maxSecsLeftInWaitingPeriod(queueId)).to.eq(0)

      const usdcAmountBefore = await usdc.balanceOf(user1Address)
      await bridge.settle(queueId)
      const usdcAmountAfter = await usdc.balanceOf(user1Address)

      expect(usdcAmountAfter.sub(usdcAmountBefore)).to.eq("336756309476")
    })
  })
})
