import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { root } from '../src/config.mjs';
const directory=path.join(root,'extension');fs.copyFileSync(path.join(root,'tracker/shared.mjs'),path.join(directory,'shared.mjs'));fs.mkdirSync(path.join(directory,'icons'),{recursive:true});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function chunk(type,bytes){const body=Buffer.concat([Buffer.from(type),bytes]),result=Buffer.alloc(body.length+8);result.writeUInt32BE(bytes.length,0);body.copy(result,4);result.writeUInt32BE(crc(body),result.length-4);return result;}
for(const size of [16,32,48,128]){
  const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const rx=x/size,ry=y/size;let color=[28,101,76,255];
    const border=rx>.19&&rx<.81&&ry>.30&&ry<.71&&(rx<.23||rx>.77||ry<.34||ry>.67);
    const flap=rx>.21&&rx<.79&&Math.abs(ry-(.32+(.5-Math.abs(rx-.5))*.55))<.025;
    if(border||flap)color=[248,250,246,255];const i=y*(size*4+1)+1+x*4;for(let k=0;k<4;k++)raw[i+k]=color[k];
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  fs.writeFileSync(path.join(directory,'icons',size+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('Extension is ready in extension/. Shared rules and four PNG icons generated.');
