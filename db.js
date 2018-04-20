const { MongoClient, ISODate } = require("mongodb");
const FUND_RECORD_COLL = "fund_records";
const ACCOUNT_ADDR_COLL = "account_address";
const DB_URL = "52.220.171.16";
const DB_PORT = "27017";
const DB_NAME = "cybex_gateway";
const DB_USER = "monitor";
const DB_PASS = "76shG8jsd87dsd";
// const DB_CONNECTION = `mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]`

const DB_CONNECTION = `mongodb://${DB_USER}:${DB_PASS}@${DB_URL}:${DB_PORT}/${DB_NAME}?readPreference=secondary`;

let db;

async function getDb() {
  if (!db) {
    db = (await MongoClient.connect(DB_CONNECTION)).db().collection(FUND_RECORD_COLL);
  }
  return db;
}

module.exports = { getDb };
