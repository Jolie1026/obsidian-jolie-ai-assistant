import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// 读取manifest.json
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

// 更新versions.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2));

console.log(`版本已更新到 ${targetVersion}`);
