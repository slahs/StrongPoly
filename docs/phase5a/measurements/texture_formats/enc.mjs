import fs from 'node:fs';
import { encodeToKTX2 } from '../tools/node_modules/ktx2-encoder/dist/node/index.js';
const dir = process.argv[2];
const jobs = [
  ['albedo', 'etc1s', { isUASTC: false, qualityLevel: 160, generateMipmap: true, isKTX2File: true, isSetKTX2SRGBTransferFunc: true }],
  ['albedo', 'uastc', { isUASTC: true, generateMipmap: true, needSupercompression: true, isSetKTX2SRGBTransferFunc: true }],
  ['normal', 'uastc', { isUASTC: true, generateMipmap: true, needSupercompression: true, isNormalMap: true, isSetKTX2SRGBTransferFunc: false }],
  ['orm', 'etc1s', { isUASTC: false, qualityLevel: 160, generateMipmap: true, isSetKTX2SRGBTransferFunc: false }],
  ['orm', 'uastc', { isUASTC: true, generateMipmap: true, needSupercompression: true, isSetKTX2SRGBTransferFunc: false }],
];
const res = {};
for (const [k, mode, opt] of jobs) {
  const t = Date.now();
  const png = new Uint8Array(fs.readFileSync(`${dir}/${k}.png`));
  const raw = new Uint8Array(fs.readFileSync(`${dir}/${k}.rgba`));
  const out = await encodeToKTX2(png, { ...opt, imageDecoder: async () => ({ data: raw, width: 1024, height: 1024 }) });
  fs.writeFileSync(`${dir}/${k}.${mode}.ktx2`, out);
  res[`${k}.${mode}`] = { bytes: out.length, encodeMs: Date.now() - t };
  console.log(k, mode, out.length, Date.now() - t, 'ms');
}
for (const k of ['albedo', 'normal', 'orm']) for (const e of ['png', 'jpg', 'webp']) res[`${k}.${e}`] = { bytes: fs.statSync(`${dir}/${k}.${e}`).size };
fs.writeFileSync(`${dir}/sizes.json`, JSON.stringify(res, null, 1));
