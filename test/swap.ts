import { waffle, ethers } from "@nomiclabs/buidler"
import {Wallet, Signer, Bytes} from "ethers";
import chai from "chai"
import { deployContract, solidity} from "ethereum-waffle"
import { utils } from "ethers"

import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { SwapUtils } from "../build/typechain/SwapUtils"

import SwapArtifact from "../build/artifacts/Swap.json"
import { Swap } from "../build/typechain/Swap"

import ERC20Artifact from "../build/artifacts/ERC20.json"
import { Erc20 as ERC20 } from "../build/typechain/Erc20";

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

import {Artifact} from "@nomiclabs/buidler/types";

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
    const provider = waffle.provider
    let signers: Array<Signer>
    let swap : Swap
    let mathUtils : MathUtils
    let swapUtils : SwapUtils
    let erc20Token1 : ERC20
    let erc20Token2 : ERC20

    beforeEach(async () => {
        signers = await ethers.getSigners()

        // Deploy dummy tokens
        erc20Token1 = (await deployContract(
            <Wallet>signers[0],
            ERC20Artifact,
            ['First Token', 'FIRST']
        )) as ERC20

        erc20Token2 = (await deployContract(
            <Wallet>signers[0],
            ERC20Artifact,
            ['Second Token', 'SECOND']
        )) as ERC20

        // Deploy MathUtils
        mathUtils = (await deployContract(
            <Wallet>signers[0],
            MathUtilsArtifact,
        )) as MathUtils

        // Link MathUtils Bytecode to SwapUtils
        const swapUtilsFactory = await ethers.getContractFactory(
            SwapUtilsArtifact.abi,
            linkBytecode(SwapUtilsArtifact, { MathUtils : mathUtils.address })
        )

        swapUtils = (await swapUtilsFactory.deploy()) as SwapUtils
        await swapUtils.deployed()

        // Link SwapUtils Bytecode to Swap
        const swapFactory = await ethers.getContractFactory(
            SwapArtifact.abi,
            linkBytecode(SwapArtifact, { SwapUtils : swapUtils.address })
        )

        swap = (await swapFactory.deploy(
            [erc20Token1.address, erc20Token2.address], [String(1e18), String(1e18)], "LP Token Name", "LP", 50, String(1e7)
        )) as Swap

        await swap.deployed()
    })

    describe("getA", () => {
        it("getA returns correct value", async () => {
            expect(await swap.getA()).to.eq(50)
        })
    })
})

// Workaround for linking libraries not yet working in buidler-waffle plugin
// https://github.com/nomiclabs/buidler/issues/611
function linkBytecode(artifact : Artifact, libraries : any) : string | Bytes {
    let bytecode = artifact.bytecode;

    for (const [fileName, fileReferences] of Object.entries(
        artifact.linkReferences
    )) {
        for (const [libName, fixups] of Object.entries(fileReferences)) {
            const addr = libraries[libName]
            if (addr === undefined) {
                continue;
            }

            for (const fixup of fixups) {
                bytecode =
                    bytecode.substr(0, 2 + fixup.start * 2) +
                    addr.substr(2) +
                    bytecode.substr(2 + (fixup.start + fixup.length) * 2)
            }
        }
    }

    return bytecode
}