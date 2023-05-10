// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/*eslint-disable*/
import { Yearn } from "@yfi/sdk";
// const Yearn = require('@yfi/sdk');

import { JsonRpcProvider } from "@ethersproject/providers";
// const JsonRpcProvider = require('@ethersproject/providers');


// Ethereum mainnet
const chainId = 1;

// It is recommended to use Alchemy for your Web3 provider when using the Yearn SDK.
const rpcUrl = `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`;

async function main() {
  const yearn = new Yearn(chainId, {
    provider: new JsonRpcProvider(rpcUrl)
  });
  console.log(yearn)

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
