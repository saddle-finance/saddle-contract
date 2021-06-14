const shell = require('shelljs'); // This module is already a solidity-coverage dep

module.exports = {
  onCompileComplete: async function(config){
    shell.exec("typechain --target ethers-v5 --outDir ./build/typechain './build/artifacts/*.json'");
  },
  onIstanbulComplete: async function(config){
    shell.rm('-rf', './build/typechain'); // Clean up at the end
  },
  // TODO: remove VirtualSwap from skipFiles once coverage is added
  // TODO: add coverage for older contracts
  skipFiles: [
    'VirtualSwap/',
    'guarded/',
    'helper/',
    'AmplificationUtilsV1.sol',
    'SwapFlashLoanV1.sol',
    'SwapUtilsV1.sol',
    'SwapV1.sol'
  ],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true               // Run the grep's inverse set.
  }
}
