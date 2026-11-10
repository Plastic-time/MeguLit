// SPDX-License-Identifier: GPL-3.0-or-later
// SoundCloud audio: the songs stream from the artists' own SoundCloud pages through SoundCloud's official embedded player
// (https://developers.soundcloud.com/docs/api/html5-widget); the site hosts no audio. This wraps the widget in the small
// part of the HTMLAudioElement interface the player uses (src, play/pause, currentTime, duration, volume, events), so
// the lyrics, the beats and the controls work unchanged. The widget stays visible inside the player label (SoundCloud's
// own mini player, with its link), as SoundCloud asks.
// Every song plays 16 dB down: the slider's volume is multiplied by 10^(-16/20).

const API = 'https://w.soundcloud.com/player/api.js';
const GAIN = Math.pow(10, -16 / 20);
let apiPromise = null;
const loadApi = () => apiPromise || (apiPromise = new Promise((res, rej) => {
  if (window.SC?.Widget) { res(window.SC); return; }
  const s = document.createElement('script'); s.src = API; s.async = true;
  s.onload = () => res(window.SC); s.onerror = rej; document.head.append(s);
}));
const OPTS = {
  color: '#c8323c', auto_play: 'false', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false', show_teaser: 'false', visual: 'false',
};
const LOAD_OPTS = { ...Object.fromEntries(Object.entries(OPTS).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : v])), color: OPTS.color.slice(1) };
const playerUrl = url => 'https://w.soundcloud.com/player/?' + new URLSearchParams({ url, ...OPTS });

export class ScAudio extends EventTarget {
  constructor() {
    super();
    this.frame = document.createElement('iframe');
    this.frame.className = 'sc-frame';
    this.frame.title = 'SoundCloud';
    this.frame.allow = 'autoplay; encrypted-media';
    this.frame.height = '20'; this.frame.scrolling = 'no'; this.frame.frameBorder = '0';
    this.dataset = {};
    this._src = ''; this._paused = true; this._time = 0; this._duration = NaN; this._volume = 1; this.loop = false;
    this._widget = null; this._ready = null; this._wantPlay = false;
  }
  getAttribute(n) { return n === 'src' ? this._src || null : null; }
  get src() { return this._src; }
  set src(url) {
    if (url === this._src) return;
    this._src = url; this._time = 0; this._duration = NaN;
    this._ready = this._bind(url);
  }
  get paused() { return this._paused; }
  get currentTime() { return this._time; }
  set currentTime(t) { this._time = t; this._ready?.then(w => { w.seekTo(Math.max(0, t) * 1000); this.dispatchEvent(new Event('seeked')); }); }
  get duration() { return this._duration; }
  get seekable() { const d = this._duration; return Number.isFinite(d) ? { length: 1, start: () => 0, end: () => d } : { length: 0, start: () => 0, end: () => 0 }; }
  get volume() { return this._volume; }
  set volume(v) { this._volume = v; this._ready?.then(w => w.setVolume(Math.round(v * GAIN * 100))); }
  play() {
    this._wantPlay = true;
    this._ready?.then(w => w.setVolume(Math.round(this._volume * GAIN * 100)));
    if (!this._ready) return Promise.reject(new Error('no source'));
    return this._ready.then(w => new Promise((res, rej) => {
      // the widget reports PLAY when it really starts; a browser that wants a click first never does
      const ok = () => { clearTimeout(t); res(); }, t = setTimeout(() => { this.removeEventListener('play', ok); rej(new Error('not allowed')); }, 4000);
      this.addEventListener('play', ok, { once: true });
      w.play();
    }));
  }
  pause() { this._wantPlay = false; this._ready?.then(w => w.pause()); }

  async _bind(url) {
    const SC = await loadApi();
    if (!this._widget) {
      this.frame.src = playerUrl(url);
      if (!this.frame.isConnected) document.body.append(this.frame);
      const w = SC.Widget(this.frame);
      const E = SC.Widget.Events;
      await new Promise(res => w.bind(E.READY, res));
      w.bind(E.PLAY, () => {
        // SoundCloud resets its volume to 100% on a reload or a new song: ours goes back on at every start
        w.setVolume(Math.round(this._volume * GAIN * 100));
        // the length is only reliable once a sound plays
        w.getDuration(ms => { if (ms > 0 && ms / 1000 !== this._duration) { this._duration = ms / 1000; this.dispatchEvent(new Event('loadedmetadata')); } });
        if (this._paused) { this._paused = false; this.dispatchEvent(new Event('play')); }
      });
      w.bind(E.PAUSE, () => { if (!this._paused) { this._paused = true; this.dispatchEvent(new Event('pause')); } });
      w.bind(E.FINISH, () => {
        this._paused = true; this.dispatchEvent(new Event('pause'));
        if (this.loop) { w.seekTo(0); w.play(); } else this.dispatchEvent(new Event('ended'));
      });
      w.bind(E.PLAY_PROGRESS, e => { this._time = e.currentPosition / 1000; this.dispatchEvent(new Event('timeupdate')); });
      this._widget = w;
    } else {
      // a new song: the widget stops the old one; it starts the new one itself when a play was asked for
      const go = this._wantPlay;
      if (!this._paused) { this._paused = true; this.dispatchEvent(new Event('pause')); }
      // load() wants real booleans: the strings of the URL form ('false') read as true here, and the player came back
      // in its large artwork layout
      await new Promise(res => this._widget.load(url, { ...LOAD_OPTS, auto_play: go, callback: res }));
    }
    const w = this._widget;
    this._duration = await new Promise(res => w.getDuration(ms => res(ms > 0 ? ms / 1000 : NaN)));
    w.setVolume(Math.round(this._volume * GAIN * 100));
    this.dispatchEvent(new Event('loadedmetadata'));
    return w;
  }
}
