/* eslint-disable @typescript-eslint/no-var-requires */
const fetch = require("node-fetch")

;(function main() {
  const body = { method: "eth_blockNumber", params: [], id: 1, jsonrpc: "2.0" }
  fetch("http://localhost:8545", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => res.json())
    .then((json) => {
      const block = parseInt(json.result || "0x0", 16)
      if (block > 0) {
        process.exit(0)
      }
      throw new Error()
    })
    .catch(() => process.exit(1))
})()
