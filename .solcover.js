const shell = require('shelljs'); // This module is already a solidity-coverage dep

module.exports = {
  onCompileComplete: async function(config){
    shell.exec("typechain --target ethers-v5 --outDir ./build/typechain './build/artifacts/*.json'");
  },
  onIstanbulComplete: async function(config){
    shell.rm('-rf', './build/typechain'); // Clean up at the end
  },
  skipFiles: ['helper/test/TestSwapReturnValues.sol', 'Timelock.sol']
}
