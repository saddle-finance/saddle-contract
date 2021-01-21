import { BigNumber, Signer, utils, Wallet } from "ethers"
import {
  asyncForEach,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
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
import { GenericErc20 } from "../build/typechain/GenericErc20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { LpToken } from "../build/typechain/LpToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { IVirtualSynth } from "../build/typechain/IVirtualSynth"
import IVirtualSynthArtifact from "../build/artifacts/synthetix/contracts/interfaces/IVirtualSynth.sol/IVirtualSynth.json"
import ERC20Artifact from "../build/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json"
import { Erc20 as ERC20 } from "../build/typechain/Erc20"
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

describe("Virtual swap bridge", () => {
  let signers: Array<Signer>
  let bridge: Bridge
  let swap: Swap
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let wbtc: GenericErc20
  let renbtc: GenericErc20
  let sbtc: GenericErc20
  let tbtc: GenericErc20
  let susd: GenericErc20
  let sdefi: GenericErc20
  let swapToken: LpToken
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
  let swapStorage: {
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
      )) as GenericErc20

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

    const balances = await getUserTokenBalances(user1Address, [
      tbtc,
      wbtc,
      renbtc,
      sbtc,
    ])

    expect(balances[0]).to.eq("72953806919870472431")
    expect(balances[1]).to.eq("90380233073")
    expect(balances[2]).to.eq("32765116441")
    expect(balances[3]).to.eq("46220887120771774898")

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
    swap = (await deployContractWithLibraries(
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
    await swap.deployed()

    swapStorage = await swap.swapStorage()

    swapToken = (await ethers.getContractAt(
      LPTokenArtifact.abi,
      swapStorage.lpToken,
    )) as LpToken

    // Deploy Bridge contract
    bridge = (await deployContract(owner, BridgeArtifact)) as Bridge
    await bridge.deployed()

    // Set deposit limits
    await allowlist.setPoolCap(swap.address, BigNumber.from(10).pow(24))
    await allowlist.setPoolAccountLimit(
      swap.address,
      BigNumber.from(10).pow(24),
    )

    // Approve token transfer to Swap for addling liquidity and to bridge for virtual swaps
    await asyncForEach(
      [tbtc, wbtc, renbtc, sbtc, susd, sdefi],
      async (t: GenericErc20) => {
        await t.connect(user1).approve(swap.address, MAX_UINT256)
        await t.connect(user1).approve(bridge.address, MAX_UINT256)
      },
    )

    // Add initial liquidity
    await swap
      .connect(user1)
      .addLiquidity(
        [String(45e18), String(45e8), String(45e8), String(45e18)],
        0,
        (await getCurrentBlockTimestamp()) + 60,
        getTestMerkleProof(user1Address),
      )

    expect(await swapToken.balanceOf(user1Address)).to.eq(String(180e18))
  })

  describe("setSynthIndex", () => {
    it("Emits SynthIndex event", async () => {
      await expect(
        bridge.setSynthIndex(
          swap.address,
          3,
          utils.formatBytes32String("sBTC"),
        ),
      ).to.emit(bridge, "SynthIndex")
    })

    it("Succeeds with correct currencyKey", async () => {
      await bridge.setSynthIndex(
        swap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(3)
    })

    it("Reverts when currencyKey do not match", async () => {
      await expect(
        bridge.setSynthIndex(
          swap.address,
          3,
          utils.formatBytes32String("sDEFI"),
        ),
      ).to.be.reverted
    })

    it("Reverts when given index is not a synth", async () => {
      await expect(
        bridge.setSynthIndex(
          swap.address,
          1,
          utils.formatBytes32String("sBTC"),
        ),
      ).to.be.reverted
    })
  })

  describe("calcTokenToVSynth", () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(3)
    })

    it("Succeeds to calculate wBTC -> sUSD", async () => {
      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        await swap.getTokenIndex(wbtc.address),
        utils.formatBytes32String("sUSD"),
        String(0.01e8),
      )

      // 0.01 wBTC -> 339.43044953 sUSD
      expect(expectedReturnAmount).to.eq("339899620423006524397")
    })

    it("Succeeds to calculate wBTC -> sDEFI", async () => {
      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        await swap.getTokenIndex(wbtc.address),
        utils.formatBytes32String("sDEFI"),
        String(0.01e8),
      )

      // sDEFI @ 5019.88196177 sUSD
      // 0.01 wBTC -> 0.06761721732 sDEFI
      expect(expectedReturnAmount).to.eq("67710679857235017")
    })
  })

  describe("tokenToVSynth", () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(3)
    })

    it("Succeeds to swap wBTC -> vsUSD -> settled to sUSD", async () => {
      const wbtcIndex = await swap.getTokenIndex(wbtc.address)

      // Calculate expected amounts
      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        wbtcIndex,
        utils.formatBytes32String("sUSD"),
        String(0.01e8),
      )

      // 0.01 wBTC -> 339.43044953 sUSD
      expect(expectedReturnAmount).to.eq("339899620423006524397")

      // Initiate tokenToVSynth
      const [vSynthAmount, vSynthAddress, queueId] = await bridge
        .connect(user1)
        .callStatic.tokenToVSynth(
          swap.address,
          wbtcIndex,
          utils.formatBytes32String("sUSD"),
          String(0.01e8),
          expectedReturnAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await (
        await bridge
          .connect(user1)
          .tokenToVSynth(
            swap.address,
            wbtcIndex,
            utils.formatBytes32String("sUSD"),
            String(0.01e8),
            expectedReturnAmount.mul(99).div(100),
            ZERO_ADDRESS,
          )
      ).wait()

      const vSynthERC20 = (await ethers.getContractAt(
        ERC20Artifact.abi,
        vSynthAddress,
      )) as ERC20
      const vSynth = (await ethers.getContractAt(
        IVirtualSynthArtifact.abi,
        vSynthAddress,
      )) as IVirtualSynth

      // Check vsynth balance of user1
      expect(await vSynthERC20.balanceOf(user1Address)).to.eq(
        "338879921561737504823",
      )
      expect(vSynthAmount).to.eq("338879921561737504823")
      const sUSDBalanceBefore = await susd.balanceOf(user1Address)

      // Wait for settle period
      await increaseTimestamp(600)
      expect(await bridge.readyToSettle(queueId)).to.eq(true)

      // Settle virtual synth
      await (await bridge.settle(queueId)).wait()
      expect(await vSynthERC20.balanceOf(user1Address)).to.eq("0")

      expect(await vSynth.synth()).to.eq(susd.address)

      // Check synth balance
      const sUSDBalanceAfter = await susd.balanceOf(user1Address)
      expect(sUSDBalanceAfter.sub(sUSDBalanceBefore)).to.eq(
        "338879921561737504823",
      )
    })

    it("Succeeds to swap wBTC -> vsDEFI -> settle to sDEFI", async () => {
      const wbtcIndex = await swap.getTokenIndex(wbtc.address)

      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        wbtcIndex,
        utils.formatBytes32String("sDEFI"),
        String(0.01e8),
      )

      // sDEFI @ 5019.88196177 sUSD
      // 0.01 wBTC -> 0.06761721732 sDEFI
      expect(expectedReturnAmount).to.eq("67710679857235017")

      // Initiate tokenToVSynth
      const [vSynthAmount, vSynthAddress, queueId] = await bridge
        .connect(user1)
        .callStatic.tokenToVSynth(
          swap.address,
          wbtcIndex,
          utils.formatBytes32String("sDEFI"),
          String(0.01e8),
          expectedReturnAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await (
        await bridge
          .connect(user1)
          .tokenToVSynth(
            swap.address,
            wbtcIndex,
            utils.formatBytes32String("sDEFI"),
            String(0.01e8),
            expectedReturnAmount.mul(99).div(100),
            ZERO_ADDRESS,
          )
      ).wait()

      const vSynthERC20 = (await ethers.getContractAt(
        ERC20Artifact.abi,
        vSynthAddress,
      )) as ERC20
      const vSynth = (await ethers.getContractAt(
        IVirtualSynthArtifact.abi,
        vSynthAddress,
      )) as IVirtualSynth

      // Check vsynth balance of user1
      expect(await vSynthERC20.balanceOf(user1Address)).to.eq(
        "67033573058662666",
      )
      expect(vSynthAmount).to.eq("67033573058662666")
      expect(queueId).to.eq("0")

      // Wait for settle period
      await increaseTimestamp(600)
      expect(await bridge.readyToSettle(queueId)).to.eq(true)
      const sDEFIBalanceBefore = await sdefi.balanceOf(user1Address)

      // Settle virtual synth
      await (await bridge.settle(queueId)).wait()
      expect(await vSynthERC20.balanceOf(user1Address)).to.eq("0")
      expect(await vSynth.synth()).to.eq(sdefi.address)

      // Check synth balance
      const sDEFIBalanceAfter = await sdefi.balanceOf(user1Address)
      expect(sDEFIBalanceAfter.sub(sDEFIBalanceBefore)).to.eq(
        "67033573058662666",
      )
    })

    it("Reverts when minAmount is not reached", async () => {
      // Initiate tokenToVSynth with max uint value as the minAmount parameter
      await expect(
        bridge
          .connect(user1)
          .tokenToVSynth(
            swap.address,
            await swap.getTokenIndex(wbtc.address),
            utils.formatBytes32String("sUSD"),
            String(0.01e8),
            MAX_UINT256,
            ZERO_ADDRESS,
          ),
      ).to.be.reverted
    })
  })

  describe("calcSynthToVToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(3)
    })

    it("Succeeds to calculate sUSD -> tBTC", async () => {
      const expectedVirtualTokenAmount = await bridge.calcSynthToVToken(
        swap.address,
        utils.formatBytes32String("sUSD"),
        await swap.getTokenIndex(tbtc.address),
        BigNumber.from(50000).mul(String(1e18)),
      )

      // 50000 sUSD -> 1.468897 tBTC
      expect(expectedVirtualTokenAmount).to.eq("1468897441660230103")
    })

    it("Succeeds to calculate sDEFI -> tBTC", async () => {
      const expectedVirtualTokenAmount = await bridge.calcSynthToVToken(
        swap.address,
        utils.formatBytes32String("sDEFI"),
        await swap.getTokenIndex(tbtc.address),
        BigNumber.from(15).mul(String(1e18)),
      )

      // 15 sDEFI -> 2.211387 tBTC
      expect(expectedVirtualTokenAmount).to.eq("2211387595574030393")
    })
  })

  describe("synthToVToken", async () => {
    beforeEach(async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        3,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(3)
    })

    it("Succeeds to swap sUSD -> vtBTC -> settle to tBTC", async () => {
      const tbtcIndex = await swap.getTokenIndex(tbtc.address)

      const expectedVirtualTokenAmount = await bridge.calcSynthToVToken(
        swap.address,
        utils.formatBytes32String("sUSD"),
        tbtcIndex,
        BigNumber.from(50000).mul(String(1e18)),
      )

      // 50000 sUSD -> 1.468897 tBTC
      expect(expectedVirtualTokenAmount).to.eq("1468897441660230103")

      const [vTokenId, queueId] = await bridge
        .connect(user1)
        .callStatic.synthToVToken(
          swap.address,
          utils.formatBytes32String("sUSD"),
          tbtcIndex,
          BigNumber.from(50000).mul(String(1e18)),
          expectedVirtualTokenAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      await bridge
        .connect(user1)
        .synthToVToken(
          swap.address,
          utils.formatBytes32String("sUSD"),
          tbtcIndex,
          BigNumber.from(50000).mul(String(1e18)),
          expectedVirtualTokenAmount.mul(99).div(100),
          ZERO_ADDRESS,
        )

      // On an actual network, front end should parse the logs to retrieve the queueId
      expect(vTokenId).to.eq("1")
      expect(queueId).to.eq("0")

      expect(await bridge.readyToSettle(queueId)).to.eq(false)

      await increaseTimestamp(600)

      const tBTCAmountBefore = await tbtc.balanceOf(user1Address)
      await bridge.settle(queueId)
      const tBTCAmountAfter = await tbtc.balanceOf(user1Address)

      expect(tBTCAmountAfter.sub(tBTCAmountBefore)).to.eq("1464493571116930502")
    })
  })
})
