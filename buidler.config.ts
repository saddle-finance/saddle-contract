import { usePlugin } from "@nomiclabs/buidler/config"
import { BuidlerConfig } from "@nomiclabs/buidler/config"

usePlugin("@nomiclabs/buidler-ethers")
usePlugin("@nomiclabs/buidler-waffle")

const config: BuidlerConfig = {
    solc: {
        version: "0.6.10"
    }
}

export default config
