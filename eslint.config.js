// Flat config, no plugins required (works with a global `eslint` install).
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', performance: 'readonly', fetch: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly', Image: 'readonly', Audio: 'readonly',
  AudioContext: 'readonly', OfflineAudioContext: 'readonly', webkitAudioContext: 'readonly', AbortController: 'readonly',
  DOMException: 'readonly', HTMLElement: 'readonly', HTMLCanvasElement: 'readonly', HTMLImageElement: 'readonly', ImageData: 'readonly',
  ImageBitmap: 'readonly', createImageBitmap: 'readonly', OffscreenCanvas: 'readonly', indexedDB: 'readonly', IDBKeyRange: 'readonly',
  matchMedia: 'readonly', getComputedStyle: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', atob: 'readonly', btoa: 'readonly', crypto: 'readonly', alert: 'readonly', confirm: 'readonly',
  prompt: 'readonly', Event: 'readonly', CustomEvent: 'readonly', KeyboardEvent: 'readonly', PointerEvent: 'readonly', DataTransfer: 'readonly',
  FormData: 'readonly', Headers: 'readonly', Response: 'readonly', Request: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly',
  getSelection: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly', screen: 'readonly', history: 'readonly',
  MediaStream: 'readonly', DOMParser: 'readonly', XMLSerializer: 'readonly', Path2D: 'readonly', DOMMatrix: 'readonly', SVGElement: 'readonly',
  globalThis: 'readonly', self: 'readonly', Node: 'readonly', NodeFilter: 'readonly', Element: 'readonly', CSS: 'readonly',
  gsap: 'readonly', CustomEase: 'readonly', DrawSVGPlugin: 'readonly', MotionPathPlugin: 'readonly', SplitText: 'readonly', Physics2DPlugin: 'readonly',
};
const node = { process: 'readonly', require: 'readonly', module: 'writable', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly', global: 'readonly' };
const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-debugger': 'error',
  'eqeqeq': ['warn', 'smart'],
};
export default [
  { ignores: ['assets/vendor/**', 'node_modules/**', 'dev/**'] },
  { files: ['assets/js/**/*.js', 'admin/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser }, rules },
  { files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...browser, ...node } }, rules },
  { files: ['tests/**/*.cjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...browser, ...node } }, rules },
];
