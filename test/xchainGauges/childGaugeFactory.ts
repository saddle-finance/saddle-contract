import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import chai from "chai"
import { Signer, utils } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  ChildGauge,
  ChildGaugeFactory,
  ChildOracle,
  GenericERC20,
} from "../../build/typechain"
import { convertGaugeNameToSalt, ZERO_ADDRESS } from "../testUtils"
import {
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
} from "./utils"

const { expect } = chai
const saltBytes = utils.formatBytes32String("0")

describe("ChildGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let childGaugeFactory: ChildGaugeFactory
  let childGauge: ChildGauge
  let dummyToken: GenericERC20
  let anyCallTranslator: AnyCallTranslator
  let childOracle: ChildOracle

  const MOCK_ADDRESS = "0x1B4ab394327FDf9524632dDf2f0F04F9FA1Fe2eC"
  const TEST_BYTES =
    "0x7465737400000000000000000000000000000000000000000000000000000000"

  const TEST_GAUGE_NAME = "USD pool"
  const TEST_ADDRESS = "0x00000000000000000000000000000000DeaDBeef"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      const contracts = await setupAnyCallTranslator(users[0])
      anyCallTranslator = contracts.anyCallTranslator

      // **** Setup ChildOracle ****
      childOracle = await setupChildOracle(anyCallTranslator.address)

      // **** Setup ChildGaugeFactory ****
      childGaugeFactory = await setupChildGaugeFactory(
        anyCallTranslator.address,
        users[0],
        childOracle.address,
      )

      // **** Add expected callers to known callers ****
      await anyCallTranslator.addKnownCallers([childGaugeFactory.address])

      dummyToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) => f.deploy("Dummy Token", "DUMMY", 18))) as GenericERC20
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize ChildGaugeFactory", () => {
    it(`Successfully sets child gauge implementation`, async () => {
      await expect(childGaugeFactory.set_implementation(TEST_ADDRESS))
        .to.emit(childGaugeFactory, "UpdateImplementation")
        .withArgs(anyValue, TEST_ADDRESS)
      expect(await childGaugeFactory.get_implementation()).to.eq(TEST_ADDRESS)
    })
    it(`Successfully access checks when setting root gauge implementation`, async () => {
      await expect(
        childGaugeFactory.connect(signers[1]).set_implementation(TEST_ADDRESS),
      ).to.be.reverted
    })
    it(`Successfully sets voting escrow implementation`, async () => {
      await expect(childGaugeFactory.set_voting_escrow(TEST_ADDRESS))
        .to.emit(childGaugeFactory, "UpdateVotingEscrow")
        .withArgs(anyValue, TEST_ADDRESS)
      expect(await childGaugeFactory.voting_escrow()).to.eq(TEST_ADDRESS)
    })
    it("Successfully access checks sets voting escrow implementation", async () => {
      await expect(
        childGaugeFactory.connect(signers[1]).set_voting_escrow(MOCK_ADDRESS),
      ).to.be.reverted
    })
  })
  describe("deploy_gauge", () => {
    it(`Successfully deploys a child gauge`, async () => {
      await expect(
        childGaugeFactory["deploy_gauge(address,bytes32,string,address)"](
          dummyToken.address,
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          TEST_GAUGE_NAME,
          users[0],
        ),
      )
        .to.emit(childGaugeFactory, "DeployedGauge")
        .withArgs(
          anyValue, // implementation address
          dummyToken.address,
          anyValue, // msg.sender, pool creation requestor
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          anyValue, // deployed gauge address
          TEST_GAUGE_NAME,
        )

      expect(await childGaugeFactory.get_gauge(0)).to.not.eq(ZERO_ADDRESS)
    })
  })
})
