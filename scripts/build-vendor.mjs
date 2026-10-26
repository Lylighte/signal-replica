import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const outdir=new URL('../dist/vendor/',import.meta.url);
const projectRoot=fileURLToPath(new URL('..',import.meta.url));
await mkdir(outdir,{recursive:true});

await build({
  stdin:{
    contents:`
      export {
        AudioBufferSource,
        BufferTarget,
        CanvasSource,
        Mp4OutputFormat,
        Output,
        canEncodeAudio,
        canEncodeVideo
      } from 'mediabunny';
      export {registerAacEncoder} from '@mediabunny/aac-encoder';
    `,
    resolveDir:projectRoot,
    sourcefile:'signal-mediabunny-entry.js',
    loader:'js'
  },
  outfile:fileURLToPath(new URL('mediabunny.js',outdir)),
  bundle:true,
  format:'esm',
  platform:'browser',
  target:['es2022'],
  minify:true,
  legalComments:'eof'
});

await copyFile(
  new URL('../node_modules/mediabunny/LICENSE',import.meta.url),
  new URL('MPL-2.0.txt',outdir)
);
