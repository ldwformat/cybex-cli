const { init } = require("./init");
const { multiTransfer } = require("./../func/transfer");

init(["file"]).then(({ daemon, args }) => {
  const INVERTAL = parseInt(args.interval, 10) || 0;
  const LOG_PREFIX = args.log || `transfer_bench_${args.file}_${Date.now()}`;
  const ASSET = args.asset || "1.3.0";
  const AMOUNT = parseInt(args.amount, 10) || 1;
  const nameList = require(args.file);
  multiTransfer(nameList, INVERTAL, LOG_PREFIX).bind({ daemon })(ASSET, AMOUNT);
});
