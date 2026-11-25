/** OF-D: immutable owner-approved native R2 outdoor models. */
export const OF_OUTDOOR_SOURCE='926416f7e79d37ee2969dd41732591e770a8d43a';
export const OF_OUTDOOR_DIR='./assets/furniture/of-r2/';
export const OF_OUTDOOR_ASSETS=Object.freeze({
  "garden.bench": {
    "file": "models/garden.bench-new.glb",
    "sha256": "eb4407b9e6abc3ad42568f90e3a5d9242845dd7af81fa7f84714aeb4de7cd30b",
    "bytes": 66344,
    "triangles": 1592,
    "boundsBlender": [
      [
        -0.75,
        -0.3149999976158142,
        0
      ],
      [
        0.75,
        0.3149999976158142,
        1.1799999475479126
      ]
    ],
    "materials": 2
  },
  "garden.table": {
    "file": "models/garden.table-new.glb",
    "sha256": "2d594a6fd0c2640d423cc5b702384dbfe1c6c6e224aca4a95822d968651144d1",
    "bytes": 33264,
    "triangles": 1080,
    "boundsBlender": [
      [
        -0.5299999713897705,
        -0.5299999713897705,
        0.015420431271195412
      ],
      [
        0.5299999713897705,
        0.5299999713897705,
        0.9150000214576721
      ]
    ],
    "materials": 2
  },
  "garden.grill": {
    "file": "models/garden.grill-new.glb",
    "sha256": "c8131547df8ced619ddc3e19540765270b22559150d5bdc533acfa9858965dd0",
    "bytes": 96200,
    "triangles": 2128,
    "boundsBlender": [
      [
        -0.6100000143051147,
        -0.4099999964237213,
        0
      ],
      [
        0.7893686890602112,
        0.4099999964237213,
        1.0555000305175781
      ]
    ],
    "materials": 4
  },
  "light.path": {
    "file": "models/light.path-new.glb",
    "sha256": "90c7413f1a3acf96cba96a28b446a195b96f69b83b4b275dd2cc58f6ce19d788",
    "bytes": 48572,
    "triangles": 1312,
    "boundsBlender": [
      [
        -0.23119999468326569,
        -0.23119999468326569,
        0
      ],
      [
        0.23119999468326569,
        0.23119999468326569,
        1.4850000143051147
      ]
    ],
    "materials": 3
  },
  "light.standing": {
    "file": "models/light.standing-new.glb",
    "sha256": "4493232feb97bd7f7edc9e0c0b85c525aaaf811ac387a632f19b56c44058c0bb",
    "bytes": 49312,
    "triangles": 1312,
    "boundsBlender": [
      [
        -0.2924000024795532,
        -0.2924000024795532,
        0
      ],
      [
        0.2924000024795532,
        0.2924000024795532,
        2.7750000953674316
      ]
    ],
    "materials": 3
  },
  "fence.wood": {
    "file": "models/fence.wood-new.glb",
    "sha256": "e50c6a2b94d7efcd5d8c012e15f8b9b362440d7e100d0e296d4fac0aa0a87fbe",
    "bytes": 30280,
    "triangles": 648,
    "boundsBlender": [
      [
        -0.2549999952316284,
        -0.057500001043081284,
        0
      ],
      [
        0.2549999952316284,
        0.057500001043081284,
        0.8974999785423279
      ]
    ],
    "materials": 2
  },
  "hedge.short": {
    "file": "models/hedge.short-new.glb",
    "sha256": "1fc869007b254a4639eaa8064b9b1fd40726fb96f4be681789819707fb432b92",
    "bytes": 107080,
    "triangles": 1560,
    "boundsBlender": [
      [
        -0.2656571567058563,
        -0.20679208636283875,
        0.018139388412237167
      ],
      [
        0.26510119438171387,
        0.1894395351409912,
        0.8338212370872498
      ]
    ],
    "materials": 3
  }
});
export const outdoorModelSpec=sku=>Object.hasOwn(OF_OUTDOOR_ASSETS,sku)?OF_OUTDOOR_ASSETS[sku]:null;
