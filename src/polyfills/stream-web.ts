// Polyfill for Node's `stream/web` on non-Node environments (e.g., browsers/Workers)
// Expose Web Streams API objects via ponyfill.
export { ReadableStream, WritableStream, TransformStream, ByteLengthQueuingStrategy, CountQueuingStrategy } from 'web-streams-polyfill/ponyfill';