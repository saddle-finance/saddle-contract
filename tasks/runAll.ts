import "hardhat-deploy"
import { task, types } from "hardhat/config"
import config from "../hardhat.config"
require("@nomicfoundation/hardhat-toolbox")

task("runAll", "Runs Script against multiple configured networks")
  .addParam(
    "script",
    "The name of the script file within the scripts folder to run",
    undefined,
    types.string,
  )
  .addOptionalParam(
    "networks",
    "Comma separated name(s) of the network(s) to run the script on",
    undefined,
    types.string,
  )
  .setAction(async (taskArgs, hre) => {
    let networksToRun: string[] = []
    if (taskArgs.networks) {
      console.log(taskArgs.networks)
      networksToRun = taskArgs.networks.split(",")
    } else {
      for (let key in config.networks) {
        if (key.includes("mainnet")) {
          networksToRun.push(key)
        }
      }
    }
    for (let i in networksToRun) {
      const currentNetwork = networksToRun[i]
      console.log(`Running script on network ${currentNetwork}`)
      hre.hardhatArguments.network = currentNetwork
      try {
        await hre.run("run", {
          noCompile: false,
          includeNetwork: undefined,
          script: `scripts/${taskArgs.script}`,
        })
      } catch (e) {
        console.error(`script failed on ${currentNetwork} network with: `, e)
      }
    }
  })
