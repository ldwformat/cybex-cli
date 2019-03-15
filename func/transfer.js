const { PrivateKey } = require("cybexjs");
const { decodeMemo } = require("./../utils");
const isId = str => /[12]\..+\..+/.test(str);
const fs = require("fs");
const { TransactionBuilder } = require("cybexjs");
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
async function decodeMemoDemo(wif, memoJsonStr) {
  let { daemon } = this;
  let privKeys = [PrivateKey.fromWif(wif)];
  console.log("PRIV: ", privKeys);
  let memo = {
    from: "CYB6X1RdFTnKZBWX4BfHBA7ipyaqn3NVbFdu35oqmYFueEaMWYJyZ",
    to: "CYB5EQKKi6C98ygPD1Pm2CyiHgMgp6FsdKWHwmJ8rzNs36xSXKaRx",
    nonce: "289773683539319773",
    message:
      "27879bf2c38ffa944419b81e8dc32b974fdd6a1f9a30b8d07fa01c696bc70a9ca55afae3085f57be5a0fbd4ee5c05f8fcb86ea24428f95e716d9647866c67f89a5e9eacb0ca944c32e1328edc348b866"
  };
  return decodeMemo(memo, privKeys);
}

exports.decodeMemoDemo = decodeMemoDemo;

async function proposalAtomTransfer(
  account,
  value_out,
  asset_out,
  value_in,
  asset_in
) {
  let { daemon } = this;
  let pair_account;
  if (!isId(account)) {
    pair_account = (await daemon.getAccountByName(account))["id"];
  } else {
    pair_account = account;
  }
  let self = daemon.daemonAccountInfo.get("id");
  let a_out = (await getAsset.call(this, asset_out))[0];
  let a_in = (await getAsset.call(this, asset_in))[0];
  let tx_out = {
    fee: {
      amount: 0,
      asset_id: "1.3.0"
    },
    from: self,
    to: pair_account,
    amount: {
      amount: parseInt(value_out * Math.pow(10, a_out.precision)),
      asset_id: a_out.id
    }
  };
  let tx_in = {
    fee: {
      amount: 0,
      asset_id: "1.3.0"
    },
    from: pair_account,
    to: self,
    amount: {
      asset_id: a_in.id,
      amount: parseInt(value_in * Math.pow(10, a_in.precision))
    }
  };

  let tx = new TransactionBuilder();
  let op_in = tx.get_type_operation("transfer", tx_out);
  let op_out = tx.get_type_operation("transfer", tx_in);
  return await daemon.performProposalTransaction(tx, [op_in, op_out]);
}

async function proposalOverride(_from, _to, _asset, value) {
  let { daemon } = this;
  let asset = (await getAsset(_asset))[0];
  console.log("Issuer: ", daemon.daemonAccountInfo.get("id"));
  let from = await getAccountId(_from);
  let to = await getAccountId(_to);
  let transfer = {
    fee: {
      asset_id: "1.3.0",
      amount: 0
    },
    issuer: daemon.daemonAccountInfo.get("id"),
    from,
    to,
    amount: {
      asset_id: asset.id,
      amount: parseInt(value * Math.pow(10, asset.precision))
    },
    extensions: []
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("override_transfer", transfer);
  return await daemon.performProposalTransaction(tx, [tr]);;
}

async function proposalCallOrder(
) {
  let { daemon } = this;
  let order = {
    fee: {
      amount: 0,
      asset_id: "1.3.0"
    },
    seller: "1.2.144",
    amount_to_sell: {
      asset_id: "1.3.132",
      amount: 1000000
    },
    fill_or_kill: false,
    min_to_receive: {
      asset_id: "1.3.128",
      amount: 1000000
    },
    expiration: "2020-01-01T00:00:00Z"
  };
  let call = {
    fee: {
      amount: 0,
      asset_id: "1.3.0"
    },
    funding_account: "1.2.144",
    delta_collateral: {
      asset_id: "1.3.0",
      amount: 1000000
    },
    delta_debt: {
      asset_id: "1.3.132",
      amount: 1000000
    }
  };

  let tx = new TransactionBuilder();
  let op_call = tx.get_type_operation("call_order_update",call );
  let op_order = tx.get_type_operation("limit_order_create", order);
  return await daemon.performProposalTransaction(tx, [op_call, op_order]);
}

exports.proposalOverride = proposalOverride;
exports.proposalAtomTransfer = proposalAtomTransfer;
exports.proposalCallOrder = proposalCallOrder;

const multiTransfer = (list, interval, logPrefix, cb) =>
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
            if (cb) {
              cb();
            }
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
