import PIXI from 'pixi.js';
import BPromise from 'bluebird';
import Howler from 'howler';
import _some from 'lodash/collection/any';
import _delay from 'lodash/function/delay';
import Utils from '../libs/utils';
import Duck from './Duck';
import Dog from './Dog';
import Hud from './Hud';

const MAX_X = 800;
const MAX_Y = 600;

const DUCK_POINTS = {
  ORIGIN: new PIXI.Point(MAX_X / 2, MAX_Y)
};
const DOG_POINTS = {
  DOWN: new PIXI.Point(MAX_X / 2, MAX_Y),
  UP: new PIXI.Point(MAX_X / 2, MAX_Y - 230),
  SNIFF_START: new PIXI.Point(0, MAX_Y - 130),
  SNIFF_END: new PIXI.Point(MAX_X / 2, MAX_Y - 130)
};
const HUD_LOCATIONS = {
  SCORE: new PIXI.Point(MAX_X - 105, 20),
  WAVE_STATUS: new PIXI.Point(60, MAX_Y * 0.97 - 10),
  GAME_STATUS: new PIXI.Point(MAX_X / 2, MAX_Y * 0.45),
  BULLET_STATUS: new PIXI.Point(10, 10)
};

const FLASH_MS = 60;
const FLASH_SCREEN = new PIXI.Graphics();
FLASH_SCREEN.beginFill(0xFFFFFF);
FLASH_SCREEN.drawRect(0, 0, MAX_X, MAX_Y);
FLASH_SCREEN.endFill();
FLASH_SCREEN.position.x = 0;
FLASH_SCREEN.position.y = 0;

class Stage extends PIXI.Container {

  /**
   * Stage Constructor
   * Container for the game
   * @param opts
   * @param opts.spritesheet - String representing the path to the spritesheet file
   */
  constructor(opts) {
    super();
    this.spritesheet = opts.spritesheet;
    this.interactive = true;
    this.ducks = [];
    this.dog = new Dog({
      spritesheet: opts.spritesheet,
      downPoint: DOG_POINTS.DOWN,
      upPoint: DOG_POINTS.UP
    });
    this.dog.visible = false;
    this.flashScreen = FLASH_SCREEN;
    this.flashScreen.visible = false;
    this.hud = new Hud();

    this._setStage();
    this.scaleToWindow();
  }

  static scoreBoxLocation() {
    return HUD_LOCATIONS.SCORE;
  }

  static waveStatusBoxLocation() {
    return HUD_LOCATIONS.WAVE_STATUS;
  }

  static gameStatusBoxLocation() {
    return HUD_LOCATIONS.GAME_STATUS;
  }

  static bulletStatusBoxLocation() {
    return HUD_LOCATIONS.BULLET_STATUS;
  }

  /**
   * scaleToWindow
   * Helper method that scales the stage container to the window size
   */
  scaleToWindow() {
    this.scale.set(window.innerWidth / MAX_X, window.innerHeight / MAX_Y);
  }

  /**
   * _setStage
   * Private method that adds all of the main pieces to the scene
   * @returns {Stage}
   * @private
   */
  _setStage() {
    let background = new PIXI.extras.MovieClip([PIXI.loader.resources[this.spritesheet].textures['scene/back/0.png']]);
    background.position.set(0, 0);

    let tree = new PIXI.extras.MovieClip([PIXI.loader.resources[this.spritesheet].textures['scene/tree/0.png']]);
    tree.position.set(100, 237);

    this.addChild(tree);
    this.addChild(background);
    this.addChild(this.dog);
    this.addChild(this.flashScreen);
    this.addChild(this.hud);

    return this;
  }

  /**
   * preLevelAnimation
   * Helper method that runs the level intro animation with the dog and returns a promise that resolves
   * when it's complete.
   * @returns {Promise}
   */
  preLevelAnimation() {
    let _this = this;
    let animationPromise = new BPromise.pending();

    this.cleanUpDucks();

    let sniffOpts = {
      startPoint: DOG_POINTS.SNIFF_START,
      endPoint: DOG_POINTS.SNIFF_END
    };

    let findOpts = {
      onComplete: function() {
        _this.setChildIndex(_this.dog, 0);
        animationPromise.resolve();
      }
    };

    this.dog.sniff(sniffOpts).find(findOpts);

    return animationPromise.promise;
  }

  /**
   * addDucks
   * Helper method that adds ducks to the container and causes them to fly around randomly.
   * @param {Number} numDucks - How many ducks to add to the stage
   * @param {Number} speed - Value from 0 (slow) to 10 (fast) that determines how fast the ducks will fly
   */
  addDucks(numDucks, speed) {
    for (let i = 0; i < numDucks; i++) {
      let duckColor = i % 2 === 0 ? 'red' : 'black';

      // Al was here.
      let newDuck = new Duck({
        spritesheet: this.spritesheet,
        colorProfile: duckColor,
        maxX: MAX_X,
        maxY: MAX_Y
      });
      newDuck.position.set(DUCK_POINTS.ORIGIN.x, DUCK_POINTS.ORIGIN.y);
      this.addChildAt(newDuck, 0);
      newDuck.randomFlight({
        speed: speed
      });

      this.ducks.push(newDuck);
    }
  }

  /**
   * shotsFired
   * Click handler for the stage, scale's the location of the click to ensure coordinate system
   * alignment and then calculates if any of the ducks were hit and should be shot.
   * @param {{x:Number, y:Number}} clickPoint - Point where the container was clicked in real coordinates
   * @returns {Number} - The number of ducks hit with the shot
   */
  shotsFired(clickPoint) {
    let _this = this;

    // flash the screen
    this.flashScreen.visible = true;
    _delay(function() {
      _this.flashScreen.visible = false;
    }, FLASH_MS);

    clickPoint.x /= this.scale.x;
    clickPoint.y /= this.scale.y;
    let ducksShot = 0;
    for (let i = 0; i < this.ducks.length; i++) {
      let duck = this.ducks[i];
      if (duck.alive && Utils.pointDistance(duck.position, clickPoint) < 60) {
        ducksShot++;
        duck.shot();
        duck.timeline.add(function() {
          _this.dog.retrieve();
        });
      }
    }
    return ducksShot;
  }

  /**
   * flyAway
   * Helper method that causes the sky to change color and the ducks to fly away
   * @returns {Promise} - This promise is resolved when all the ducks have flown away
   */
  flyAway() {
    this.dog.laugh();

    let duckPromises = [];

    for (let i = 0; i < this.ducks.length; i++) {
      let duck = this.ducks[i];
      if (duck.alive) {
        let duckAnimation = new BPromise.pending();
        duck.stopAndClearTimeline();
        duck.flyTo({
          point: new PIXI.Point(MAX_X / 2, -500),
          onComplete: duckAnimation.resolve.bind(duckAnimation)
        });
        duckPromises.push(duckAnimation.promise);
      }
    }

    return BPromise.all(duckPromises).then(this.cleanUpDucks.bind(this));
  }

  /**
   * cleanUpDucks
   * Helper that removes all ducks from the container and object
   */
  cleanUpDucks() {
    for (let i = 0; i < this.ducks.length; i++) {
      this.removeChild(this.ducks[i]);
    }
    this.ducks = [];
  }

  /**
   * ducksAlive
   * Helper that returns a boolean value depending on whether or not ducks are alive. The distinction
   * is that even dead ducks may be animating and still "active"
   * @returns {Boolean}
   */
  ducksAlive() {
    return _some(this.ducks, function(duck) {
      return duck.alive;
    });
  }

  /**
   * ducksActive
   * Helper that returns a boolean value depending on whether or not ducks are animating. Both live
   * and dead ducks may be animating.
   * @returns {Boolean}
   */
  ducksActive() {
    return _some(this.ducks, function(duck) {
      return duck.isActive();
    });
  }

  /**
   * dogActive
   * Helper proxy method that returns a boolean depending on whether the dog is animating
   * @returns {boolean}
   */
  dogActive() {
    return this.dog.isActive();
  }

  /**
   * isActive
   * High level helper to determine if things are animating on the stage
   * @returns {boolean|Boolean}
   */
  isActive() {
    return this.dogActive() || this.ducksAlive() || this.ducksActive();
  }
}

export default Stage;