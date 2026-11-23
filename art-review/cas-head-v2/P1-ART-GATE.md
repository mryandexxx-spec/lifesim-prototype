# CAS-HEAD-V2-P1 — isolated head-asset art gate (in progress)

**Status 2026-11-24: DCC head sculpt/rig/UV not finished. NO NEW HEADS, NO OWNER ART APPROVAL.**

This isolated P1 branch builds on the CC0 topology-donor feasibility draft #264 and does **not** replace the source GLBs, approved footwear, gameplay, save format or PR #145. The machine-readable gate added here is a *rejection filter* for future **actual Blender-exported** head files, never a head generator or evidence that new art exists.

## Genuine asset deliverables (NOT YET SATISFIED)

- Artist-authored alex-derivative-head.glb and mira-derivative-head.glb, individually source-fitted (not transplanted MPFB mannequins), with deformation-friendly eyelid/mouth/nostril loops, actual skin materials, independently unwrapped skin-head UV and properly designed facial textures, eye volumes, hairline and seamless neck.
- Actual head skin bound to the unchanged family 66-joint hierarchy with exact original family clip names (10 Alex / 13 Mira), properly weighted neck transition and separate geometric eyes, nose, lips, chin, cheeks shape keys. Underlying Hero GLBs must remain byte-identical.
- Real PlayCanvas scene comparing unchanged heroes against at least two visibly distinct residents per family; front/three-quarter/profile/full-height/idle/walk/sit shots at 390×844 and 320×568. No old R2 variants or recolored/mannequin stand-ins in this preview.
- Explicit owner visual acceptance BEFORE gameplay/CAS integration.

## First independent technical acceptance test

After Blender export, run:

    node art-review/cas-head-v2/verify-derived-heads.mjs /path/to/alex-derivative-head.glb /path/to/mira-derivative-head.glb

Mandatory Blender custom export tags: the **derivative head mesh** must have glTF mesh extras lifeSimRole: derivative-head and targetNames: [eyes,nose,lips,chin,cheeks,...]; its skinned node must have skin; its skin material name begins CAS_HEAD_SKIN_ and uses a separate embedded color texture. Check literal glTF export output, not Blender UI labels.

This structural validator checks original SHA, distinct new binary, 66-joint source order/name/parent hierarchy, exact original clip names, skinned vertex normals/UV/weights, separate embedded non-source skin texture, nonempty finite geometry morphs and non-identical target regions. Missing GLBs are a **hard failure**. It deliberately leaves face loop artistry, source resemblance, UV stretch, eyelid/eyeball contact, neck seam under motion, actual running PlayCanvas pixels and owner decision **FALSE**; those require independent DCC/render/human checks.

Do **not** mark this P1 as finished, merge P1 into main, or present the old MPFB full-body technical donor as a new resident merely because the structural tests pass. The source's combined baked atlas is known to make R2 facial stretching unfit for art.

## Capabilities and current blocker

The local editing runtime has neither Blender executable nor bpy, nor direct GitHub clone networking. The GitHub connector can commit scripts and run PR CI, but cannot itself sculpt/check visual 3D meshes. A scripted geometry/rig validator is useful preventive progress, **not** a substitute for the missing DCC sculpt or an acceptable preview. Any next Blender runner must produce real files and renderable image/GLB evidence; do not accept its exit code alone.

Skills read for this task: project playcanvas-lifesim, playcanvas-cas-identity-morphs, main-branch blender-core, blender-facial-shapekeys, blender-character-rigging, blender-animation, blender-asset-qa, blender-export-pipelines, scenario-blender-sculpting, pc-inspect-glb, pc-load-assets, pc-configure-animation, pc-verify-pixels, create-game-assets; installed game-asset-production. These are instructions, not an invoked sculpting program.
