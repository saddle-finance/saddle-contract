import "hardhat-deploy"
import config from "../hardhat.config"
import { subtask, task, types } from "hardhat/config"
import { NetworkUserConfig } from "hardhat/types"
require("@nomicfoundation/hardhat-toolbox")

task("runAll", "Runs Script against all configured networks")
  .addParam("script", "The name of the script within the scripts folder to run")
  .setAction(async (taskArgs, hre) => {
    console.log("taskargs", taskArgs)
    for (let key in config.networks) {
      if (key.includes("mainnet")) {
        hre.hardhatArguments.network = key
        console.log(`Connected to ${key}`)
        try {
          await hre.run("run", {
            noCompile: false,
            includeNetwork: undefined,
            script: `scripts/${taskArgs.script}`,
          })
        } catch (e) {
          console.log(`script failed on ${key} network with: `)
          console.log(e)
        }
      }
    }
  })
