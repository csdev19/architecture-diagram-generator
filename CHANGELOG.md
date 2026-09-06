# Changelog

## [0.4.1](https://github.com/csdev19/architecture-diagram-generator/compare/v0.4.0...v0.4.1) (2026-09-06)


### Bug Fixes

* **domain:** a platform is a boundary, not a node — and let the hook commit ignored files ([70f3c1f](https://github.com/csdev19/architecture-diagram-generator/commit/70f3c1f14e7f6f8801c9f755325fb553b6bcb608))
* **domain:** tell the repository prompts a platform is a boundary, not a node ([9cb570b](https://github.com/csdev19/architecture-diagram-generator/commit/9cb570be1b13a1c8bef205360293457220734385))

## [0.4.0](https://github.com/csdev19/architecture-diagram-generator/compare/v0.3.0...v0.4.0) (2026-09-06)


### Features

* **domain:** compose three repository prompts from the guidelines ([cd15404](https://github.com/csdev19/architecture-diagram-generator/commit/cd1540491f54d43e46090360bfdc3183d8c6d185))
* **editor:** put a Project prompt beside the Image one, with a shape selector ([1893b12](https://github.com/csdev19/architecture-diagram-generator/commit/1893b12d7658f7bbba4f2b81c7bca6365151f188))
* improve repository diagram prompts ([19fd237](https://github.com/csdev19/architecture-diagram-generator/commit/19fd2374badf749c88e4addec09008303e48890c))
* make repository diagram prompts paste-safe ([b53fef8](https://github.com/csdev19/architecture-diagram-generator/commit/b53fef85bf4fe43925530360f072b54920e59b7e))

## [0.3.0](https://github.com/csdev19/architecture-diagram-generator/compare/v0.2.1...v0.3.0) (2026-09-05)


### Features

* **domain:** add icon:add, which turns any svg into a registry art entry ([8734740](https://github.com/csdev19/architecture-diagram-generator/commit/87347409c29aa1d50c62b85c1ec5cefb1c82edfe))
* **domain:** add tanstack and effect to the brand-mark registry ([bc70030](https://github.com/csdev19/architecture-diagram-generator/commit/bc700304a870d8a0b57cf1c162e0130e29f7d8fd))
* **domain:** draw brand marks in colour, with a mono switch ([4eb0146](https://github.com/csdev19/architecture-diagram-generator/commit/4eb01467ce1d42eadbb28a4cef6f180653c92640))
* **domain:** draw every brand mark through one helper that knows about colour art ([d5f1421](https://github.com/csdev19/architecture-diagram-generator/commit/d5f14214d5d0623ecd4ac073c34aafe5394c8044))
* **domain:** give hono, angular and tanstack query their colour art ([7312eb6](https://github.com/csdev19/architecture-diagram-generator/commit/7312eb6b595c9d8c5dbb7b060ee8cbf836326e21))
* **domain:** let a document choose colour or mono for its brand marks ([df2f3b8](https://github.com/csdev19/architecture-diagram-generator/commit/df2f3b8a2a86daba956ca8b829f31511aa7181d1))
* **editor:** draw palette thumbnails with the renderer's mark helper ([7ae6e6e](https://github.com/csdev19/architecture-diagram-generator/commit/7ae6e6ed6c315ca135ced435ce50760d8ec62886))
* **editor:** export a PNG with no paper or grid behind it ([5c22d2c](https://github.com/csdev19/architecture-diagram-generator/commit/5c22d2cabeb53ff4269ac2a5a5f34c538419483e))
* **editor:** export a PNG with no paper or grid behind it ([740508d](https://github.com/csdev19/architecture-diagram-generator/commit/740508d843d2398efc89a8bd9d162b888aa3594f))
* **editor:** give the diagram a title field, and name every export after it ([e6a45dd](https://github.com/csdev19/architecture-diagram-generator/commit/e6a45dd80a8fcdddd624d277dd50d0d18af1446a))
* **editor:** give the diagram a title field, and name every export after it ([1dd0057](https://github.com/csdev19/architecture-diagram-generator/commit/1dd0057c571c25a8f98c066314aa59e0461b0c09))
* **editor:** let the author switch brand marks between colour and mono ([1230207](https://github.com/csdev19/architecture-diagram-generator/commit/1230207dea610428e64e68963868f8dd7d7ff9b3))
* **editor:** navigate the canvas the way Excalidraw does ([fd3f56e](https://github.com/csdev19/architecture-diagram-generator/commit/fd3f56eee9d7a915c21efd50947ff96430499a45))
* **editor:** pan the canvas with the wheel, a frame at a time ([f4c6402](https://github.com/csdev19/architecture-diagram-generator/commit/f4c6402a15096fcb5b57247b7d0b0781b776e14f))
* **editor:** zoom the canvas on a pinch rather than on every wheel ([2ff2571](https://github.com/csdev19/architecture-diagram-generator/commit/2ff2571f7444536b3be65aa4750c8a8a58bf0ea4))


### Bug Fixes

* **domain:** close the curation gaps a fourth icon would fall into ([eac52f4](https://github.com/csdev19/architecture-diagram-generator/commit/eac52f46a3c642e2f8e19a4eba5995f58ce019a2))
* **domain:** drop the sort that guarded a bug that cannot happen, add a reference-integrity guard ([d9de7bb](https://github.com/csdev19/architecture-diagram-generator/commit/d9de7bba64081d08005310e79dbee8ec1fef3038))
* **domain:** renumber single-quoted ids too, and assert no id ships unprefixed ([dae4676](https://github.com/csdev19/architecture-diagram-generator/commit/dae46760aeda544eb1ad8770808316604b0b8845))
* **domain:** seed a generic title, so a fresh diagram is not called payments ([105756f](https://github.com/csdev19/architecture-diagram-generator/commit/105756ffcd5a1516303528ed222e9f39d62a7e73))
* **editor:** hold a dragged tile where it was grabbed, not by its centre ([019e7c3](https://github.com/csdev19/architecture-diagram-generator/commit/019e7c3fdc876eebeeb8e1842f4a5f6d19724b1e))
* **editor:** keep a panned camera from snapping back, and close review gaps ([61f9e62](https://github.com/csdev19/architecture-diagram-generator/commit/61f9e624d35ba6bc00d4a14072a8a8ee2c3708bc))


### Code Refactoring

* **domain:** give every brand mark a mono half, so colour art has somewhere to go ([80449e6](https://github.com/csdev19/architecture-diagram-generator/commit/80449e69ba4e172abbc44d119470d9e4c5551697))

## [0.2.1](https://github.com/csdev19/architecture-diagram-generator/compare/v0.2.0...v0.2.1) (2026-09-04)


### Bug Fixes

* **domain:** bound each text field by the shape that actually draws it ([d712819](https://github.com/csdev19/architecture-diagram-generator/commit/d71281938038a4077f38633d77528096618c97db))
* **domain:** bound each text field by the shape that actually draws it ([d0b0470](https://github.com/csdev19/architecture-diagram-generator/commit/d0b0470d6f0ec9f42c361d129500784f9292f3c7))

## [0.2.0](https://github.com/csdev19/architecture-diagram-generator/compare/v0.1.0...v0.2.0) (2026-09-04)


### Features

* **diagram:** let a node show a monogram when no logo exists ([4fb9abb](https://github.com/csdev19/architecture-diagram-generator/commit/4fb9abbd90b3a49042a418b586c4e1beb8780b74))
* **diagram:** let a node show a monogram when no logo exists ([52c6c1a](https://github.com/csdev19/architecture-diagram-generator/commit/52c6c1a24cde2c46f5c1715b35068e23882e96f2))
* **editor:** give the app an icon and a byline ([6fb3ce1](https://github.com/csdev19/architecture-diagram-generator/commit/6fb3ce1bcc9b82a61d24d6a2a35abec7ec36b8c8))
* **editor:** give the app an icon and a byline ([cbbb0e6](https://github.com/csdev19/architecture-diagram-generator/commit/cbbb0e68f3892b43e5ab7f440b6fa974d1f5d505))
* **editor:** hand the author the prompt that turns a sketch into a diagram ([d69bc29](https://github.com/csdev19/architecture-diagram-generator/commit/d69bc29fab24aeb6cf530e6669eef70901786e05))
* **editor:** hand the author the prompt that turns a sketch into a diagram ([00eed92](https://github.com/csdev19/architecture-diagram-generator/commit/00eed92dc6b8077651129a47ceea9d35fc186cc2))


### Bug Fixes

* **ci:** stop formatting the files release-please generates ([5895751](https://github.com/csdev19/architecture-diagram-generator/commit/589575101eab5ed974d7cacbbb15d98eec0724a2))
* **ci:** stop formatting the files release-please generates ([0f8bc4b](https://github.com/csdev19/architecture-diagram-generator/commit/0f8bc4bef934a3e495674f7d57cd2dcd05c83c4b))
* **domain:** let a visible arrowhead outrank a conventional flow ([d60dc1c](https://github.com/csdev19/architecture-diagram-generator/commit/d60dc1c8204084887bfd93fc06942ccdc54e3935))
* **domain:** stop a photographed sketch from being drawn mirrored ([e56e85d](https://github.com/csdev19/architecture-diagram-generator/commit/e56e85d9e93dfb8aa84221a3029ccc43fd20b03b))
* **domain:** stop a photographed sketch from being drawn mirrored ([05ccb1c](https://github.com/csdev19/architecture-diagram-generator/commit/05ccb1c97449b6c18bc407931ba27f4693fd410a))
* **domain:** stop the dark tile reading as a quota to fill ([51bdfcb](https://github.com/csdev19/architecture-diagram-generator/commit/51bdfcb438b749ba97a7f0dada7cf07e879ecf84))
* **domain:** teach the sketch prompt what the first real photo got wrong ([112b8e7](https://github.com/csdev19/architecture-diagram-generator/commit/112b8e7ced21cd4e2cd6c708bcf16b2f51972380))
* **editor:** make the sketch prompt return JSON, and fix what review found ([4e7040a](https://github.com/csdev19/architecture-diagram-generator/commit/4e7040a92fc2aa4d66e2f34d106be8ac7ed8dbe2))
* **editor:** stop claiming the sketch prompt accepts an Excalidraw export ([aed1db7](https://github.com/csdev19/architecture-diagram-generator/commit/aed1db7a8ba69c3a379996536eb601fa58596e8d))
* **icons:** draw Hono's flame solid, from the official logo ([5a0d702](https://github.com/csdev19/architecture-diagram-generator/commit/5a0d702c7f61966d995abf7f9b6861d657227b50))
* **icons:** draw Hono's flame solid, from the official logo ([d9d483f](https://github.com/csdev19/architecture-diagram-generator/commit/d9d483f69df24b1e0cb0ba31b36bb35c4a4d88fd))


### Code Refactoring

* **editor:** stop the header growing into the toolbar, and retire Place ([4f602bb](https://github.com/csdev19/architecture-diagram-generator/commit/4f602bbbd3158300811ae7b4192d7fa6a8813365))
* **editor:** stop the header growing into the toolbar, and retire Place ([682ba99](https://github.com/csdev19/architecture-diagram-generator/commit/682ba9998779f18ff5686d4d900130a47f64aa23))

## 0.1.0 (2026-09-03)


### Features

* **deploy:** give the app a production origin at diagrams.cs19.dev ([1a3bbfd](https://github.com/csdev19/architecture-diagram-generator/commit/1a3bbfd4676dd4237dfb8f180155ecbd4f97d7de))
* give the app a production origin at diagrams.cs19.dev ([b768016](https://github.com/csdev19/architecture-diagram-generator/commit/b768016641b1e005d1d8bdccf6ea40bb288c91b4))


### Bug Fixes

* **release:** make the first release 0.1.0, not 1.0.0 ([d5782dc](https://github.com/csdev19/architecture-diagram-generator/commit/d5782dcf4112957a9003966dbc3c28ec7b295ec2))
* **release:** make the first release 0.1.0, not 1.0.0 ([afe876e](https://github.com/csdev19/architecture-diagram-generator/commit/afe876e1132052da86121726da9069715cc38f50))


### Code Refactoring

* **app:** make the editor the only route, and delete the site around it ([f29d21c](https://github.com/csdev19/architecture-diagram-generator/commit/f29d21ca06aa155fc78eae32178de7ae00ebbeee))
* make the editor the only route, and delete the site around it ([6e2c037](https://github.com/csdev19/architecture-diagram-generator/commit/6e2c037de89665fa3cc075e479d8771f12acaa80))
