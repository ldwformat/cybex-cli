const { TransactionBuilder, PrivateKey, ChainTypes } = require("cybexjs");
async function createCommittee(accountName, url = "") {
  let { cmds, daemon } = this;
  let id = (await cmds.getAccount(accountName)).id;
  let tr = new TransactionBuilder();
  let params = {
    fee: {
      asset_id: "1.3.0",
      amount: 0
    },
    committee_member_account: id,
    url
  };
  let op = tr.get_type_operation("committee_member_create", params);
  return await daemon.performTransaction(tr, op);
}

module.exports = createCommittee;
