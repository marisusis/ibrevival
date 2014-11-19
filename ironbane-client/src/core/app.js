angular.module('Ironbane', [
        'angus.templates.app',
        'game.ui',
        'game.game-loop',
        'game.world-root',
        'ces',
        'three',
        'ammo',
        'ammo.physics-world',
        'components',
        'game.scripts',
        'game.prefabs',
        'engine.entity-builder',
        'engine.sound-system',
        'engine.ib-config',
        'engine.input.input-system',
        'engine.util',
        'game.game-socket'
    ])
    .config(function (SoundSystemProvider, $gameSocketProvider) {
        //$gameSocketProvider.setUrl('http://dev.server.ironbane.com:5001');
        $gameSocketProvider.setUrl('http://localhost:5001');

        // define all of the sounds & music for the game
        SoundSystemProvider.setAudioLibraryData({
            theme: {
                path: 'assets/music/ib_theme',
                volume: 0.55,
                loop: true,
                type: 'music'
            }
        });
    })
    .config(function (IbConfigProvider) {
        // Used for input events
        IbConfigProvider.set('domElement', document);
    })
    .run(function ($rootScope, System, CameraSystem, ModelSystem, $rootWorld, THREE,
        LightSystem, SpriteSystem, QuadSystem, HelperSystem, SceneSystem, ScriptSystem,
        SoundSystem, InputSystem, RigidBodySystem, CollisionReporterSystem, $http, $log,
        EntityBuilder, WieldItemSystem, Util, $gameSocket) {

        'use strict';

        $gameSocket.on('connect', function () {
            $log.log('socket connect', arguments);
        });

        $gameSocket.on('error', function () {
            $log.warn('socket error: ', arguments);
        });

        $gameSocket.on('chat message', function (message) {
            $log.log('msg: ', message);
        });

        $gameSocket.on('spawn', function (data) {
            $log.log('spawn', data);

            // TODO: move this to more specific player creation service method
            var player = EntityBuilder.build('Player', {
                rotation: data.rotation,
                position: data.position,
                components: {
                    ghost: {
                        id: data._id,
                        player: true // this so we don't sync up TODO: don't ghost player
                    },
                    quad: {
                        transparent: true,
                        texture: 'assets/images/characters/skin/2.png'
                    },
                    rigidBody: {
                        shape: {
                            type: 'box',
                            width: 0.5,
                            height: 1.0,
                            depth: 0.5

                            // type: 'sphere',
                            // radius: 0.5
                        },
                        mass: 1,
                        friction: 0.0,
                        restitution: 0,
                        allowSleep: false,
                        lock: {
                            position: {
                                x: false,
                                y: false,
                                z: false
                            },
                            rotation: {
                                x: true,
                                y: true,
                                z: true
                            }
                        }
                    },
                    collisionReporter: {

                    },
                    // helper: {
                    //     line: true
                    // },
                    health: {
                        max: 5,
                        value: 5
                    },
                    camera: {
                        aspectRatio: $rootWorld.renderer.domElement.width / $rootWorld.renderer.domElement.height
                    },
                    script: {
                        scripts: [
                            '/scripts/built-in/character-controller.js',
                            '/scripts/built-in/character-multicam.js',
                            '/scripts/built-in/sprite-sheet.js',
                        ]
                    }
                }
            });
            $rootWorld.addEntity(player);
        });

        var starterScene = 'obstacle-test-course-one';

        // asset preload here
        // TODO: at some point have a loading screen with this preloading everything needed rather than just one
        $rootScope.ironbaneReady = $http.get('assets/scene/' + starterScene + '/ib-world.json', {
            cache: true
        });

        // TODO: move to directive
        $rootWorld.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild($rootWorld.renderer.domElement);
        $rootWorld.renderer.setClearColorHex(0xd3fff8);

        window.addEventListener('resize', function () {
            $rootWorld.renderer.setSize(window.innerWidth, window.innerHeight);
        }, false);

        $rootScope.ironbaneReady.then(function () {

            // DEBUG editor mode?
            var grid = new THREE.GridHelper(100, 1);
            $rootWorld.scene.add(grid);

            // TODO: build this out better
            function buildPlayerGhost(data) {
                var player = EntityBuilder.build('NetPlayer', {
                    rotation: data.rotation,
                    position: data.position,
                    components: {
                        ghost: {
                            id: data._id
                        },
                        quad: {
                            transparent: true,
                            texture: 'assets/images/characters/skin/2.png'
                        },
                        health: {
                            max: 5,
                            value: 5
                        },
                        script: {
                            scripts: [
                                '/scripts/built-in/sprite-sheet.js',
                            ]
                        }
                    }
                });
                $rootWorld.addEntity(player);
            }
            var netsync = new System();
            netsync.update = function (dt) {
                $gameSocket.emit('sync');
            };
            netsync.sync = function (data) {
                var ghosts = this.world.getEntities('ghost');

                // first update the ones we already have
                angular.forEach(ghosts, function (ghost) {
                    var ghostComponent = ghost.getComponent('ghost');

                    for (var i = 0; i < data.length; i++) {
                        if (data[i]._id === ghostComponent.id) {
                            if (!ghostComponent.player) {
                                ghost.position.fromArray(data[i].position);
                                ghost.rotation.fromArray(data[i].rotation);
                            }
                            data[i].ghosted = true;
                            break;
                        }
                    }
                });

                // add new ones (the rest)
                angular.forEach(data, function (g) {
                    if (!g.ghosted) {
                        buildPlayerGhost(g);
                    }
                });
            };
            $gameSocket.on('sync', function (data) {
                // here is where we need to update all the other players
                //$log.debug('sync: ', data);
                netsync.sync(data);
            });
            $rootWorld.addSystem(netsync);

            $rootWorld.addSystem(new InputSystem(), 'input');
            $rootWorld.addSystem(new SoundSystem());
            $rootWorld.addSystem(new ScriptSystem());
            $rootWorld.addSystem(new SceneSystem());
            $rootWorld.addSystem(new SpriteSystem());
            $rootWorld.addSystem(new ModelSystem());
            $rootWorld.addSystem(new LightSystem());
            $rootWorld.addSystem(new QuadSystem());
            $rootWorld.addSystem(new RigidBodySystem());
            $rootWorld.addSystem(new CollisionReporterSystem());
            $rootWorld.addSystem(new HelperSystem());
            $rootWorld.addSystem(new WieldItemSystem());
            // NOTE: this should be the LAST system as it does rendering!!
            $rootWorld.addSystem(new CameraSystem());

            // var musicEntity = EntityBuilder.build('MusicPlayer', {
            //     components: {
            //         sound: {
            //             asset: 'theme',
            //             loop: true
            //         }
            //     }
            // });
            // $log.debug('musicEntity', musicEntity);
            // $rootWorld.addEntity(musicEntity);

            var cube = EntityBuilder.build('Cubey-Doobey-Doo', {
                position: [0, 3, 0],
                components: {
                    model: {
                        //default
                    },
                    script: {
                        scripts: [{
                                src: 'assets/scripts/test.js',
                                params: {
                                    speed: 0.5
                                }
                            }

                            // Disabled as it interferes with regular DOM keyevent listeners
                            // '/scripts/built-in/input-test.js'
                        ]
                    }
                }
            });
            $rootWorld.addEntity(cube);



            for (var i = 0; i < 1; i++) {
                (function (i) {

                    setTimeout(function () {
                        // console.log('Spawning ' + i);
                        var bunny = EntityBuilder.build('Bunny', {
                            rotation: [0, Math.PI / 2, 0],
                            position: [-2, 17, -8],
                            // position: [Util.getRandomInt(-55, -45), 100, Util.getRandomInt(-55, -45)],
                            components: {
                                quad: {
                                    transparent: true,
                                    texture: 'assets/images/characters/skin/29.png'
                                },
                                rigidBody: {
                                    shape: {
                                        type: 'sphere',
                                        // height: 1,
                                        radius: 0.5
                                    },
                                    mass: 1,
                                    friction: 0,
                                    restitution: 0,
                                    allowSleep: false,
                                    lock: {
                                        position: {
                                            x: false,
                                            y: false,
                                            z: false
                                        },
                                        rotation: {
                                            x: true,
                                            y: true,
                                            z: true
                                        }
                                    }
                                },
                                // helper: {
                                //     line: true
                                // },
                                script: {
                                    scripts: [
                                        '/scripts/built-in/sprite-sheet.js',
                                        '/scripts/special/spawn-100-bunnies.js'
                                    ]
                                },
                                health: {
                                    max: 5,
                                    value: 5
                                }
                            }
                        });
                        $rootWorld.addEntity(bunny);
                    }, i * 500);
                })(i);
            }

            var level = EntityBuilder.build('TestLevel', {
                components: {
                    scene: {
                        id: 'obstacle-test-course-one'
                    },
                    rigidBody: {
                        shape: {
                            type: 'concave'
                        },
                        mass: 0
                    },
                    light: {
                        type: 'AmbientLight',
                        color: 0x333333
                    }
                }
            });
            $rootWorld.addEntity(level);

            // after the level and whatnot is loaded, request a player spawn
            $gameSocket.emit('request spawn');

            // HACK for easy debug
            window.rw = $rootWorld;

        });
    });
