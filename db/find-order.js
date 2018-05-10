const { getDb } = require("./db");
async function findOrder(filter) {
  let table = await getDb();
  let res = await table.find(filter);
  return res;
}

module.exports = { findOrder };
