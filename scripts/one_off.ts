import { ethers } from "hardhat"
import {
    Minter} from "../build/typechain"

async function main() {
    const signers = await ethers.getSigners()
  
    const gaugeController = (await ethers.getContract(
      "GaugeController",
    )) as GaugeController
    const sdl = (await ethers.getContract("SDL")) as SDL
    const veSDL = (await ethers.getContract("VotingEscrow")) as VotingEscrow
    const minter = (await ethers.getContract("Minter")) as Minter