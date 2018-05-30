const { init } = require("./init");
const { decodeMemoImpl } = require("./../cybex-daemon/utils");
const { genKeysFromWif } = require("./../utils");
const { PrivateKey } = require("cybexjs");

return init(["memo", "wif"], false)
  .then(({ daemon, args }) => {
    let memo = JSON.parse(args.memo);
    let privKey = PrivateKey.fromWif(args.wif);
    console.log(decodeMemoImpl(memo, privKey));
    process.exit();
  })
  .catch(e => console.error(e));
