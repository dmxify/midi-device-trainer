const MidiDevice = require('../midi-device/index.js')
const MidiDeviceControl = require('../midi-device-control/index.js')
const Stopwatch = require('js-stopwatch')

const CONTROL_TYPES = {
  "BUTTON": "BUTTON",
  "FADER": "FADER"
}
Object.freeze(CONTROL_TYPES)
const CONTROL_SUBTYPES = {
  "ON": "ON",
  "ON_OFF": "ON_OFF",
  "SPECIAL": "SPECIAL"
}
Object.freeze(CONTROL_SUBTYPES)
const CONTROL_MODES = {
  "TRIGGER": "TRIGGER",
  "REPEAT": "REPEAT"
}
Object.freeze(CONTROL_MODES)


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

const determineControlOptions = function(arrUniqueMidiMessageData, numMidiMessages) {
  let type = '';
  let subType = '';
  let mode = '';
  let duplicates = false;
  // if there are more midi messages than there are unique midi messages, then there will be duplicates
  if (numMidiMessages > arrUniqueMidiMessageData.length) {
    duplicates = true;
  }

  switch (arrUniqueMidiMessageData.length) {
    case 1:
      type = CONTROL_TYPES.BUTTON;
      subType = CONTROL_SUBTYPES.ON;
      mode = (duplicates) ? CONTROL_MODES.REPEAT : CONTROL_MODES.TRIGGER;
      break;
    case 2:
      type = CONTROL_TYPES.BUTTON;
      subType = CONTROL_SUBTYPES.ON_OFF;
      mode = (duplicates) ? CONTROL_MODES.REPEAT : CONTROL_MODES.TRIGGER;
      break;
    case 3:
    case 4:
    default:
      // more than 2 unique inputs, either a fader/rotary, or something else special
      let arrChannels = [];
      let arrNotes = [];
      // for all the midi messages sent by the control:
      for (let ummd of arrUniqueMidiMessageData) {
        // check how many unique channels there are
        if (arrChannels.indexOf(ummd[0]) == -1) {
          arrChannels.push(ummd[0]);
        }
        // check how many unique notes there are
        if (arrNotes.indexOf(ummd[1]) == -1) {
          arrNotes.push(ummd[1]);
        }
      }
      // determine if rotary/fader (same channel + note, different values)
      if (arrChannels.length == 1 && arrNotes.length == 1) {
        type = CONTROL_TYPES.FADER;
        mode = CONTROL_MODES.TRIGGER;
      } else {
        type = CONTROL_TYPES.BUTTON;
        subType = CONTROL_SUBTYPES.SPECIAL;
        mode = CONTROL_MODES.REPEAT;
      }
      break;
  }

  return {
    type: type,
    subType: subType,
    mode: mode
  }
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
    // if (this._arrMidiMessageData.length > 2) {
    //  this._stopwatch.stop(); // stop so that callback doesnt execute later
    //  this._onTrained(); //execute now
    // }
  }

  /**
   * Creates trained MidiDeviceControl
   */
  createTrainedMidiDeviceControl() {
    let arrUniqueMidiMessageData = makeUniqueArray(this._arrMidiMessageData);
    let options = determineControlOptions(arrUniqueMidiMessageData, this._arrMidiMessageData.length);

    // get array of midi device's controls
    // if already exists, update existing control,
    // else create it and set it

    let midiDeviceControl_alreadyExists = false;
    for (let midiMessageData of arrUniqueMidiMessageData) {
      // check if a MidiDeviceControl of specific type exists with specific binding
      if (MidiDevice.hasControlWithBindingsOf(this._trainingMidiDevice, options.type, midiMessageData)) {
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
      let name = `${options.type}_${this._trainingMidiDevice.numOfControlType(options.type) + 1}`
      this._trainingMidiDeviceControl = new MidiDeviceControl({
        id: id,
        name: name,
        type: options.type,
        subType: options.subType,
        mode: options.mode

      });
      for (let midiMessageData of arrUniqueMidiMessageData) {
        this._trainingMidiDeviceControl.addMidiMessageBinding(midiMessageData);
      }
      this._trainingMidiDevice.addMidiDeviceControl(this._trainingMidiDeviceControl);
    }

  }
}

module.exports = MidiDeviceTrainer;
