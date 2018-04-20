const { TransactionBuilder, PrivateKey, ChainTypes } = require("cybexjs");
const assert = require("assert");
async function findWhoHas(startId = 1, endId = -1, ...assets) {
  let { cmds, daemon } = this;
  let { getBalance } = cmds;
  let balances = [];
  console.log("Find " + assets + " From " + startId + " to " + endId);
  assert(endId > 0, "The end id should be provided!");
  for (let i = parseInt(startId); i < parseInt(endId) + 1; i++) {
    let id = "1.2." + i;
    console.log("BAL To FIND: ", id);
    balances.push({
      id,
      bal: await getBalance(id, ...assets)
    });
  }
  return balances.filter(balObj => balObj.bal.some(b => b.amount > 0));
}

module.exports = findWhoHas;
