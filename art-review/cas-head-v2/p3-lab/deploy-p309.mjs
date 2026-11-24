import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const files = [
  [
    "index.html",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/index.html",
    "1c87429e1d8486c55eadf38f5f830caaca6e1b56e937423d73eb18a705810cb2"
  ],
  [
    "app.mjs",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/app.mjs",
    "4f14a2622f4047156eb43fb76528afe976def7794e458f858fb4354bea39e68e"
  ],
  [
    "config.mjs",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/config.mjs",
    "39a216db0d1d1f67b3028023ebf61ecec5a8856bd185604be1fe11d02c6de83e"
  ],
  [
    "style.css",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/style.css",
    "98405b66ad3a47b1783dfc6acdb933e36de3b32cee96b602702158d281341002"
  ],
  [
    "candidate.json",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/candidate.json",
    "856516c60c7e8d0ffdd6f2dc4d22ef600545eec4efbd180d5d7872db622a1ae7"
  ],
  [
    "assets/alex-p3.glb",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/assets/alex-p3.glb",
    "ab9595c5fa4e8f962aaf3697311fa47e175ed3754d9f585207bd79523f2bce5a"
  ],
  [
    "assets/mira-p3.glb",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/art-review/cas-head-v2/p3-lab/assets/mira-p3.glb",
    "26a65437db84024a6bc0a2cb33fddd9935c60f1f88a3a55c76a53c63b3e0de71"
  ],
  [
    "assets/meshy-casual-v1.glb",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/assets/characters/meshy-casual-v1.glb",
    "7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4"
  ],
  [
    "assets/meshy-mira-mobile-v1.glb",
    "https://raw.githubusercontent.com/mryandexxx-spec/lifesim-prototype/3b9cc80005cf1f892da0ec766ece359f75d275fa/assets/characters/meshy-mira-mobile-v1.glb",
    "40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a"
  ],
  [
    "vendor/playcanvas.mjs",
    "https://cdn.jsdelivr.net/npm/playcanvas@2.24.1/build/playcanvas.min.mjs",
    "b5883ab4ef8356ece4ca2551cc92421adebf77e0e15d58733ff9dbe66c6e3f3e"
  ]
];
for (const [path,url,expected] of files) {
  const response = await fetch(url,{signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(digest!==expected) throw Error(`${path}: SHA-256 mismatch ${digest}`);
  const target=join('public',path); await mkdir(dirname(target),{recursive:true}); await writeFile(target,bytes);
  console.log(`${path}: SHA-256 PASS (${bytes.length} bytes)`);
}
