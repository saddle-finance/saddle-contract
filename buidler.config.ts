import { task, usePlugin } from "@nomiclabs/buidler/config"
import { BuidlerConfig } from "@nomiclabs/buidler/config"
import { TASK_COMPILE } from "@nomiclabs/buidler/builtin-tasks/task-names"
import { tsGenerator } from "ts-generator"
import { TypeChain } from "typechain/dist/TypeChain"

usePlugin("@nomiclabs/buidler-ethers")
usePlugin("@nomiclabs/buidler-waffle")
usePlugin("solidity-coverage")

task("typechain", "Generate contract typings with typechain").setAction(
  async ({}, { config, run }) => {
    await run(TASK_COMPILE)

    console.log(`Creating Typechain artifacts in ./build/typechain/...`)

    const cwd = process.cwd()
    await tsGenerator(
      { cwd },
      new TypeChain({
        cwd,
        rawConfig: {
          files: "./build/artifacts/*.json",
          outDir: "./build/typechain/",
          target: "ethers-v5",
        },
      }),
    )

    console.log(`Successfully generated Typechain artifacts!`)
  },
)

const config: BuidlerConfig = {
  defaultNetwork: "buidlerevm",
  networks: {
    coverage: {
      url: "http://127.0.0.1:8555",
    },
  },
  paths: {
    artifacts: "./build/artifacts",
    cache: "./build/cache",
  },
  solc: {
    version: "0.5.11",
  },
}

export default config
