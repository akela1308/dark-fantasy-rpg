// Node не импортирует JSON без `with { type: 'json' }`, а Vite импортирует.
// Этот хук разрешает игровым модулям `import x from './file.json'` под node --test.
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
    }
    return nextLoad(url, context);
  },
});
