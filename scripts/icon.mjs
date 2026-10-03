import fs from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
// Small geometric d. mark. Generated locally; no remote image or font dependency.
const size = 1024; const pixels = Buffer.alloc(size * (size * 4 + 1));
const circle = (x, y, cx, cy, r) => (x-cx)**2 + (y-cy)**2 <= r*r;
for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
  const offset = y*(size*4+1)+1+x*4;
  const dx = Math.max(0, Math.abs(x-512)-272); const dy = Math.max(0, Math.abs(y-512)-272);
  const inside = dx*dx+dy*dy <= 180*180;
  const ring = circle(x,y,425,574,181) && !circle(x,y,425,574,89);
  const stem = x>=514 && x<=606 && y>=259 && y<=750;
  const dot = circle(x,y,740,704,48); const color = ring || stem || dot ? 247 : 30;
  pixels[offset] = pixels[offset+1] = pixels[offset+2] = color; pixels[offset+3] = inside ? 255 : 0;
}
function crc(bytes) { let n=0xffffffff; for(const b of bytes) { n^=b; for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0); } return (n^0xffffffff)>>>0; }
function chunk(type, data) { const label=Buffer.from(type); const length=Buffer.alloc(4); length.writeUInt32BE(data.length); const sum=Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([label,data]))); return Buffer.concat([length,label,data,sum]); }
const header=Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
await fs.mkdir('assets', {recursive:true}); await fs.writeFile('assets/icon.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
