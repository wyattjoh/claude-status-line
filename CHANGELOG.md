# Changelog

## [0.7.0](https://github.com/wyattjoh/claude-status-line/compare/claude-status-line-v0.6.2...claude-status-line-v0.7.0) (2026-05-02)


### Features

* add 5h session and 7d week rate-limit modules ([42bb515](https://github.com/wyattjoh/claude-status-line/commit/42bb5156621a3133c14930c33e89cdb57a7b45c4))
* add pace variance indicator to session and week modules ([7db97ff](https://github.com/wyattjoh/claude-status-line/commit/7db97ffd9641413dee97c7f81ede3d1353ab9145))
* add rolling burn rate to rate limit modules ([40e3824](https://github.com/wyattjoh/claude-status-line/commit/40e3824efcba5832ba93fe7b12a4cb8170be016f))
* replace burn rate with hit forecast ([cf7b5fd](https://github.com/wyattjoh/claude-status-line/commit/cf7b5fdd0852ceb62009c8ec1b84b3f269d53444))

## [0.6.2](https://github.com/wyattjoh/claude-status-line/compare/claude-status-line-v0.6.1...claude-status-line-v0.6.2) (2026-04-02)


### Bug Fixes

* use used_percentage from context_window for accurate context display ([a212484](https://github.com/wyattjoh/claude-status-line/commit/a212484197cd4297ae5feeeaf82f5f82bb92e9e6))

## [0.6.1](https://github.com/wyattjoh/claude-status-line/compare/claude-status-line-v0.6.0...claude-status-line-v0.6.1) (2026-03-30)


### Bug Fixes

* update README with correct version references and 1M context example ([b03f917](https://github.com/wyattjoh/claude-status-line/commit/b03f917aaf454bc27c5fcf2695176ad31d692727))

## [0.6.0](https://github.com/wyattjoh/claude-status-line/compare/claude-status-line-v0.5.0...claude-status-line-v0.6.0) (2026-03-30)


### Features

* add --currency flag to customize session cost display ([25d7836](https://github.com/wyattjoh/claude-status-line/commit/25d783690625663076507be57c4ca9fed9be44ae))
* add --modules flag for selective status line display ([62179b1](https://github.com/wyattjoh/claude-status-line/commit/62179b169156604a380e6fb07f7fdbd04a8da4eb))
* add extended status line metrics and improve reliability ([624a8fb](https://github.com/wyattjoh/claude-status-line/commit/624a8fb38923224fc35de2fa00a6450d714b394a))
* add session cost tracking and context usage display ([621f1d0](https://github.com/wyattjoh/claude-status-line/commit/621f1d008a978e41f72b124403eb1c4520cad58d))
* add weather display with --location flag ([70bae0f](https://github.com/wyattjoh/claude-status-line/commit/70bae0f2b67850af3c7c17e00f01f74742c44b72))
* use provided cost for session ([8bf8bf3](https://github.com/wyattjoh/claude-status-line/commit/8bf8bf309eab9cacc7c272fa5ccda6584d075e77))


### Bug Fixes

* fixed execution when deployed to jsr ([9fdb882](https://github.com/wyattjoh/claude-status-line/commit/9fdb88247967646e21477890e37090541df8431e))
* fixed instructions ([187809b](https://github.com/wyattjoh/claude-status-line/commit/187809b235528224ec3e7362d41d024cc74365ec))
* fixed publishing configuration ([af770d6](https://github.com/wyattjoh/claude-status-line/commit/af770d6ac606e3c2f93969f0621d2eac1a11bb51))
* fixed types ([fb17386](https://github.com/wyattjoh/claude-status-line/commit/fb1738674c06052d1d925a15c98570ace4824371))
* remove .DS_Store ([78e2fa1](https://github.com/wyattjoh/claude-status-line/commit/78e2fa11f3ac73d576f09de4312122ff9cb9785b))
* use correct context window size for 1M token models ([9331c63](https://github.com/wyattjoh/claude-status-line/commit/9331c635d067c5dd1425f904900be7b7dd7b086f))
