const UMYCoin = artifacts.require("UMYCoin");

module.exports = function (deployer) {
  deployer.deploy(UMYCoin, web3.utils.toWei("100000", "ether"));
};
