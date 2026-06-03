/**
 * EventBus — простая шина событий для связи систем без прямых зависимостей.
 * Использование:
 *   import eventBus from './eventBus.js';
 *   eventBus.on('unit_died', (unit) => { ... });
 *   eventBus.emit('unit_died', unit);
 */

class EventBus {
  constructor() {
    this._events = {};
  }

  on(event, listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }

  off(event, listener) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(l => l !== listener);
  }

  emit(event, ...args) {
    if (!this._events[event]) return;
    this._events[event].forEach(l => l(...args));
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  clear() {
    this._events = {};
  }
}

export default new EventBus();
