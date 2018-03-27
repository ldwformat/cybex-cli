const fs = require("fs");
const a2091 = fs.readFileSync("./2091.json", { encoding: "utf-8" });

fs.writeFileSync("./2091_json.json", JSON.stringify(a2091));