const { PrivateKey } = require("cybexjs");
const { decodeMemo } = require("../utils");
const isId = str => /[12]\..+\..+/.test(str);
const fs = require("fs");
const { TransactionBuilder } = require("cybexjs");
async function getObject(id = "1.1.1") {
  return await this.daemon.Apis.instance()
    .db_api()
    .exec("get_objects", [[id]]);
}

async function updateFee(account, value, asset = "1.3.0", memo) {
  let { daemon } = this;
  let chain_parameters = (await getObject("2.0.0"))[0].parameters;
  let fee = chain_parameters.current_fees.parameters;
  fee.forEach(fee =>
    fee[0] == 10
      ? (fee[1] = {
          symbol3: "100000000000",
          symbol4: "1000000000",
          long_symbol: 50000000,
          price_per_kbyte: 100000
        })
      : 0
  );
  let tx = {
    fee: {
      asset_id: "1.3.0",
      amount: 0
    },
    new_parameters: chain_parameters
  };
  let tr = new TransactionBuilder();
  let inspect = require("util").inspect;
  console.log(inspect(chain_parameters, { depth: null }));
  let op = tr.get_type_operation(
    "committee_member_update_global_parameters",
    tx
  );
  return await daemon.performTransaction(tr, op);
}
exports.updateFee = updateFee;
