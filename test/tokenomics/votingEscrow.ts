import chai from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import { Allowlist, VotingEscrow } from "../../build/typechain/"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp
} from "../testUtils"

chai.use(solidity)
const { expect } = chai

describe("VotingEscrow", () => {
  let signers: Array<Signer>
  let malActor: Signer
  let deployer: Signer
  let veSDL: VotingEscrow

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      malActor = signers[10]
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("create_lock", () => {
    it("Emits PoolCap event", async () => {
      await veSDL.create_lock(
        BIG_NUMBER_1E18,
        (await getCurrentBlockTimestamp()) + 52 * 7 * 86400,
      )
    })
  })
})
