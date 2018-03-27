const { PrivateKey } = require("cybexjs");

function keyTest(wif) {
  let privKeys = PrivateKey.fromWif(wif);
  let pubKeys = privKeys.toPublicKey().toString();
  return pubKeys;
}

module.exports = {
  keyTest
};