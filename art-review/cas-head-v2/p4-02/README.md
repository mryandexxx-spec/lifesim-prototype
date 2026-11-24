# CAS-HEAD-V2-P4-02 — Asya lower/mid-face review
Owner authorized proceeding after P4-01; full artistic approval remains separate. Only Asya: localized lip width/contour, nose projection, and chin contour, with the P4-01 eyes preserved. No texture, hair, neck-seam, Leon, original Mira, game, or save changes. Base exact P4-01 GLB SHA-256 ef4f26db3842d30d6124b665fd51e0ebff27cd94bdd49f08a312d5cd99da8a2c; candidate 4f0068503afdea25284c50c5972843c63ac395aa50cdd4f12b885bdf22a7175c. Maximum neutral displacement 3.5 mm, 1341 original buffer views preserved; original joints (66), animations (13) and all five morphs retained. The editable Blender source is derived from the exact previous native .blend, not a re-import. 243 discrete combinations: 0 triangle flips, 0 new local self-intersections, min area ratio 0.422652; all eye-region vertices and their position morph deltas exact. This is not a continuous-domain proof.
Run with Node 22 and PlayCanvas dependencies installed:
```sh
node art-review/cas-head-v2/p4-02/prepare.mjs
P4_ARTIFACTS=/tmp/p402-mobile node art-review/cas-head-v2/p4-02/smoke.mjs
```
To regenerate native source, use pinned P4-01 native file or regenerate it from its scripts (Python 3.11, bpy 4.3.0, numpy 1.26.4), then:
```sh
p=art-review/cas-head-v2
python $p/p4-02/native.py $p/p4-02/site/assets/p3-p3.glb $p/p4-02/site/assets/p4-p3.glb /path/to/asya-p4-01.blend /tmp/p402-native
```
Neutral 0/45/90-degree Cycles renders and max nose/lips/chin at 0/90 degrees. No merge or game integration; owner review and physical Safari required.