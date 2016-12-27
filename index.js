const audioCtx = new AudioContext();

const samples = Rx.Observable.fromPromise(
  fetch('soundfont.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
);

getAudioStream()
  .map(analyseStream)
  .switchMap(detectPitches)
  .filter(p => p.pitchClass === 3 && p.octave === 7) // We're listening to a particular D#
  .throttleTime(50)
  .map(selectResponse)
  .delayWhen(() => Rx.Observable.interval(200 + Math.random() * 800))
  .withLatestFrom(samples)
  .subscribe(play);

function getAudioStream() {
  return Rx.Observable.fromPromise(
    navigator.mediaDevices.getUserMedia({audio: true})
  );
}

function analyseStream(stream) {
  const srcNode = audioCtx.createMediaStreamSource(stream);
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;
  srcNode.connect(analyserNode);
  return analyserNode;
}

function detectPitches(analyser) {
  return rafLoop()
    .map(() => detectPitch(analyser))
    .filter(p => p);
}

function rafLoop() {
  return Rx.Observable.generate(
    0,
    () => true,
    n => n + 1,
    n => n,
    Rx.Scheduler.animationFrame
  );
}

function detectPitch(analyserNode) {
  const buffer = new Uint8Array(analyserNode.fftSize);
  analyserNode.getByteTimeDomainData(buffer);
  const fundamentalFreq = findFundamentalFreq(buffer, audioCtx.sampleRate);
  if (fundamentalFreq !== -1) {
    const pitch = Math.round(69 + 12 * (Math.log10(fundamentalFreq/440.0) / Math.log10(2.0)));
    const octave = Math.floor(pitch / 12);
    const pitchClass = pitch - octave * 12;
    return {pitchClass, octave};
  } else {
    return null;
  }
}

// Autocorrelation impl from https://developer.microsoft.com/en-us/microsoft-edge/testdrive/demos/webaudiotuner/
function findFundamentalFreq(buffer, sampleRate) {
  const n = 1024;
  let bestR = 0, bestK = -1;
  for (let k = 8 ; k <= 1000 ; k++) {
    let sum = 0;
    for (let i = 0 ; i < n ; i++) {
      sum += ((buffer[i] - 128) / 128) * ((buffer[i + k] - 128) / 128);
    }
    const r = sum / (n + k);
    if (r > bestR) {
      bestR = r;
      bestK = k;
    }
    if (r > 0.9) {
      break;
    }
  }
  if (bestR > 0.0025) {
    return sampleRate / bestK;
  } else {
    return -1;
  }
}

function selectResponse() {
  const chord = [
    {idx: 1, color: 'indianred', pos: 1/6},
    {idx: 2, color: 'deeppink', pos: 2/6},
    {idx: 3, color: 'darkorange', pos: 3/6},
    {idx: 4, color: 'lime', pos: 4/6},
    {idx: 5, color: 'dodgerblue', pos: 5/6}
  ];
  return chord[Math.floor(Math.random() * chord.length)];
}

function play([{idx, color, pos}, sampleBuffer]) {
  const offsetTime = idx * 4;

  const src = audioCtx.createBufferSource();
  src.buffer = sampleBuffer;
  src.connect(audioCtx.destination);
  src.start(audioCtx.currentTime, offsetTime, 4);

  const rootNode = document.documentElement;
  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  bubble.style.backgroundColor = color;
  bubble.style.left = `${rootNode.offsetWidth * pos - 100}px`;
  bubble.style.top = `${rootNode.offsetHeight / 4 + Math.random() * rootNode.offsetHeight / 2}px`;
  rootNode.appendChild(bubble);
  setTimeout(() => bubble.classList.add('expanding'), 0);
  setTimeout(() => rootNode.removeChild(bubble), 4000);
}

