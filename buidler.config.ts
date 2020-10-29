import { usePlugin } from "@nomiclabs/buidler/config"
import { BuidlerConfig } from "@nomiclabs/buidler/config"

usePlugin("@nomiclabs/buidler-ethers")
usePlugin("@nomiclabs/buidler-waffle")
usePlugin("solidity-coverage")
usePlugin("buidler-typechain")

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
    version: "0.5.17",
  },
  typechain: {
    outDir: "./build/typechain/",
    target: "ethers-v5",
  },
}

export default config
