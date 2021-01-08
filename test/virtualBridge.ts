import { BigNumber, Signer, utils, Wallet } from "ethers"
import {
  asyncForEach,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getUserTokenBalances,
  impersonateAccount,
  MAX_UINT256,
  revertToSnapshot,
  setTimestamp,
  takeSnapshot,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { Bridge } from "../build/typechain/Bridge"
import BridgeArtifact from "../build/artifacts/contracts/Bridge.sol/Bridge.json"
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

import merkleTreeData from "./exampleMerkleTree.json"
import { BytesLike } from "@ethersproject/bytes"
import dotenv from "dotenv"

dotenv.config()
chai.use(solidity)
const { expect } = chai

const INITIAL_A_VALUE = 50
const SWAP_FEE = 1e7
const LP_TOKEN_NAME = "Test LP Token Name"
const LP_TOKEN_SYMBOL = "TESTLP"
const MERKLE_ROOT = merkleTreeData.merkleRoot
const ALLOWED_ACCOUNTS: Record<string, any> = merkleTreeData.allowedAccounts

function getMerkleProof(address: string): BytesLike[] {
  if (address in ALLOWED_ACCOUNTS) {
    return ALLOWED_ACCOUNTS[address].proof
  }
  return []
}

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
      holder: string
      contract: any
    }
  }

  const btcTokens: TokensListInterface = {
    wbtc: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      holder: "0x875abe6f1e2aba07bed4a3234d8555a0d7656d12",
      contract: null,
    },
    renbtc: {
      address: "0xeb4c2781e4eba804ce9a9803c67d0893436bb27d",
      holder: "0xf8c42927a60cbd4a536ce24ef8bed00b16a9b44b",
      contract: null,
    },
    sbtc: {
      address: "0xfe18be6b3bd88a2d2a7f928d00292e7a9963cfc6",
      holder: "0x3cacdfa0ad9f144f80fa251e37de54028c8424a4",
      contract: null,
    },
    tbtc: {
      address: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
      holder: "0xf9e11762d522ea29dd78178c9baf83b7b093aacc",
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

    // eslint-disable-next-line no-unused-vars
    for (const [k, v] of Object.entries(btcTokens)) {
      const contract = (await ethers.getContractAt(
        GenericERC20Artifact.abi,
        v.address,
      )) as GenericErc20

      contract
        .connect(await impersonateAccount(v.holder))
        .transfer(user1Address, await contract.balanceOf(v.holder))

      v.contract = contract
    }

    wbtc = btcTokens.wbtc.contract
    renbtc = btcTokens.renbtc.contract
    sbtc = btcTokens.sbtc.contract
    tbtc = btcTokens.tbtc.contract

    const balances = await getUserTokenBalances(user1Address, [
      wbtc,
      renbtc,
      sbtc,
      tbtc,
    ])

    expect(balances[0]).to.eq("90380233073")
    expect(balances[1]).to.eq("20813219640")
    expect(balances[2]).to.eq("30632804782203030889")
    expect(balances[3]).to.eq("72953806919870472431")

    // Deploy Allowlist
    allowlist = (await deployContract(signers[0] as Wallet, AllowlistArtifact, [
      MERKLE_ROOT,
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
          btcTokens.wbtc.address,
          btcTokens.renbtc.address,
          btcTokens.sbtc.address,
          btcTokens.tbtc.address,
        ],
        [8, 8, 18, 18],
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

    // Set deposit limits
    await allowlist.setPoolCap(swap.address, String(150e18))
    await allowlist.setPoolAccountLimit(swap.address, String(1e18))

    // Approve token transfer
    await asyncForEach([wbtc, renbtc, sbtc, tbtc], async (t: GenericErc20) => {
      t.connect(user1).approve(swap.address, MAX_UINT256)
    })

    // Add initial liquidity
    await swap
      .connect(user1)
      .addLiquidityGuarded(
        [String(0.25e8), String(0.25e8), String(0.25e18), String(0.25e18)],
        0,
        (await getCurrentBlockTimestamp()) + 60,
        getMerkleProof(user1Address),
      )

    expect(await swapToken.balanceOf(user1Address)).to.eq(String(1e18))

    // Deploy Bridge contract
    bridge = (await deployContract(owner, BridgeArtifact)) as Bridge
    await bridge.deployed()
  })

  describe("setSynthIndex", () => {
    it("Emits SynthIndex event", async () => {
      await expect(
        bridge.setSynthIndex(
          swap.address,
          2,
          utils.formatBytes32String("sBTC"),
        ),
      ).to.emit(bridge, "SynthIndex")
    })

    it("Succeeds with correct currencyKey", async () => {
      await bridge.setSynthIndex(
        swap.address,
        2,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(2)
    })

    it("Reverts when currencyKey do not match", async () => {
      await expect(
        bridge.setSynthIndex(
          swap.address,
          2,
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
    it("Succeeds to calculate wBTC -> sDEFI", async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        2,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(2)

      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        wbtc.address,
        utils.formatBytes32String("sDEFI"),
        String(0.01e8),
      )

      // sDEFI @ 5019.88196177 sUSD
      // 0.01 wBTC -> 0.06761721732 sDEFI
      expect(expectedReturnAmount).to.eq("67617217322268956")
    })

    it("Succeeds to calculate wBTC -> sUSD", async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        2,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(2)

      const expectedReturnAmount = await bridge.calcTokenToVSynth(
        swap.address,
        wbtc.address,
        utils.formatBytes32String("sUSD"),
        String(0.01e8),
      )

      // 0.01 wBTC -> 339.43044953 sUSD
      expect(expectedReturnAmount).to.eq("339430449529644987199")
    })
  })

  describe("tokenToVSynth", () => {
    it("Succeeds to swap wBTC -> vsDEFI", async () => {
      // Set sBTC index
      await bridge.setSynthIndex(
        swap.address,
        2,
        utils.formatBytes32String("sBTC"),
      )
      expect(await bridge.getSynthIndex(swap.address)).to.eq(2)

      // approve max wBTC amount to be transferred to bridge
      await wbtc.connect(user1).approve(bridge.address, MAX_UINT256)

      // Initiate tokenToVSynth
      await (
        await bridge
          .connect(user1)
          .tokenToVSynth(
            swap.address,
            wbtc.address,
            utils.formatBytes32String("sDEFI"),
            String(0.01e8),
            [user1Address],
            0,
          )
      ).wait()

      // eslint-disable-next-line new-cap
      const eventFilter = await bridge.filters.TokenToVSynth(
        user1Address,
        null,
        null,
        null,
        null,
        null,
        null,
      )

      // Parse log to find out queueId and virtual synth address
      const event = (await bridge.queryFilter(eventFilter)).pop()
      const queueId = event?.args?.queueId
      const vSynthAddress = event?.args?.vSynth
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
        "66941045149046266",
      )
      expect(await vSynth.balanceOfUnderlying(user1Address)).to.eq(
        "66941045149046266",
      )

      // Wait for settle period
      await setTimestamp((await getCurrentBlockTimestamp()) + 600)
      expect(await bridge.readyToSettle(queueId)).to.eq(true)

      // Settle virtual synth
      await (await bridge.settle(queueId)).wait()
      expect(await vSynthERC20.balanceOf(user1Address)).to.eq("0")

      const synth = (await ethers.getContractAt(
        ERC20Artifact.abi,
        await vSynth.synth(),
      )) as ERC20

      // Check synth balance
      expect(await synth.balanceOf(user1Address)).to.eq("66941045149046266")
    })
  })
})
