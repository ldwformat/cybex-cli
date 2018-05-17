const isId = str => /[12]\..+\..+/.test(str);
const fs = require("fs");
async function getObject(id = "1.1.1") {
  return await this.daemon.Apis.instance()
    .db_api()
    .exec("get_objects", [[id]]);
}
async function getAsset(...assets) {
  let { daemon } = this;
  if (isId(assets[0])) {
    return await Promise.all(assets.map(id => getObject.call(this, id)));
  }
  return await daemon.Apis.instance()
    .db_api()
    .exec("lookup_asset_symbols", [assets]);
}

async function transfer(account, value, asset = "1.3.0", memo) {
  let { daemon } = this;
  let to_account;
  if (!isId(account)) {
    to_account = (await daemon.getAccountByName(account))["id"];
  } else {
    to_account = account;
  }
  let a = (await getAsset.call(this, asset))[0][0];
  let tx = {
    to_account,
    amount: parseInt(value * Math.pow(10, a.precision)),
    asset,
    memo
  };
  return await daemon.performTransfer(tx);
}
const multiTransfer = (list, interval, logPrefix) =>
  function(asset, amount) {
    let failedNames = [];
    let counter = 0;
    let starter = Date.now();
    let doTransfer = transfer.bind(this);
    (function doOnce(counter) {
      let name = list[counter++];
      doTransfer(name, amount, asset)
        .then(res => {
          console.log(`No.${counter} ${name} done`);
          if (counter === list.length) {
            let duration = (Date.now() - starter) / 1000;
            console.log(`Total: , ${duration}s`);
            process.exit(0);
          }
        })
        .catch(err => {
          console.error("Failed: ", err);
        });
      if (counter < list.length) {
        setTimeout(() => {
          doOnce(counter);
        }, interval);
      }
    })(counter);
    return true;
  };

exports.multiTransfer = multiTransfer;
