const MidiDevice = require('../midi-device/index.js')
const MidiDeviceControl = require('../midi-device-control/index.js')
const Stopwatch = require('js-stopwatch')

const makeUniqueArray = function(arr) {
  var tmp = [];
  var b = arr.filter(function(v) {
    if (tmp.indexOf(v.toString()) < 0) {
      tmp.push(v.toString());
      return v;
    }
  });
  return b;
}

const determineControlType = function(arrMidiMessageData) {
  let controlType = '';

  switch (arrMidiMessageData.length) {
    case 1:
    case 2:
      controlType = 'BUTTON';
      break;
    case 3:
      controlType = 'ROTARY_OR_FADER';
      break;
  }

  return controlType;
}


/**
 * @class MidiDeviceTrainer
 * @param {function} onTrained - callback for when training is done
 */
const MidiDeviceTrainer = class {
  constructor() {
    this._isTraining = false;
    this._arrMidiMessageData = [];
    this._trainingMidiDevice = null;
    this._trainingMidiDeviceControl = null;
    this._midiDevices = []; // all midi devices as set by electron-midi
    this._onTrained = () => {
      this.createTrainedMidiDeviceControl();
      this._onAfterTrained(this._trainingMidiDevice, this._trainingMidiDeviceControl)
      this._arrMidiMessageData = [];
      this._trainingMidiDevice = null;
      this._trainingMidiDeviceControl = null;
    };
    this._onAfterTrained = () => {
      console.log('_onAfterTrained');
    };
    this._stopwatch = new Stopwatch({
      alarm: this._onTrained, // callback to execute...
      timeAlarmMS: 450 // ... when stopwatch reaches 2 seconds
    });
  }

  set midiDevices(val) {
    this._midiDevices = val;
  }

  set onAfterTrained(fn) {
    this._onAfterTrained = fn;
  }

  get isTraining() {
    return this._isTraining;
  }

  set isTraining(val) {
    this._isTraining = val;
    // if false, reset stopwatch
    if (!val) {
      this._stopwatch.reset();
    }
  }


  /**
   * Send onmidimessage events here after pressing a button, moving a fader or turning a rotary knob
   * @param {MidiInputMessage} - the object returned by onmidimessage
   */
  train(e) {

    // set the MidiDevice that is being trained
    if (!this._trainingMidiDevice) {
      for (let midiDevice of this._midiDevices) {
        if (midiDevice.name == e.target.name) {
          this._trainingMidiDevice = midiDevice;
        }
      }
    }

    this._arrMidiMessageData.push(e.data);
    this._stopwatch.restart(); //stop, clear and start the callback timer

    // if we already have enough data, then we dont need to wait, so execute callback ahead of stopwatch alarm
    if (this._arrMidiMessageData.length > 2) {
      this._stopwatch.stop(); // stop so that callback doesnt execute later
      this._onTrained(); //execute now
    }
  }

  /**
   * Creates trained MidiDeviceControl
   */
  createTrainedMidiDeviceControl() {
    let arrUniqueMidiMessageData = makeUniqueArray(this._arrMidiMessageData);
    let controlType = determineControlType(arrUniqueMidiMessageData);

    // get array of midi device's controls
    // if already exists, update existing control,
    // else create it and set it

    let midiDeviceControl_alreadyExists = false;
    for (let midiMessageData of arrUniqueMidiMessageData) {
      // check if a MidiDeviceControl of specific type exists with specific binding
      if (MidiDevice.hasControlWithBindingsOf(this._trainingMidiDevice, controlType, midiMessageData)) {
        midiDeviceControl_alreadyExists = true;
      }
    }
    if (midiDeviceControl_alreadyExists) {
      //this._trainingMidiDeviceControl =

      /**
       * @todo get existing control...
       */
    } else {
      let id = this._trainingMidiDevice.nextAvailableControlId();
      let name = `${controlType}_${this._trainingMidiDevice.numOfControlType(controlType) + 1}`
      this._trainingMidiDeviceControl = new MidiDeviceControl({
        id: id,
        name: name,
        controlType: controlType
      });
      for (let midiMessageData of arrUniqueMidiMessageData) {
        this._trainingMidiDeviceControl.addMidiMessageBinding(midiMessageData);
      }
      this._trainingMidiDevice.addMidiDeviceControl(this._trainingMidiDeviceControl);
    }

  }
}

module.exports = MidiDeviceTrainer;
