import createKernel from './runtime/breezecad-web.mjs';

async function loadKernel() {
  const response = await fetch(new URL('./runtime/breezecad-web.wasm.gz', import.meta.url));
  if (!response.ok) throw new Error('Не удалось загрузить геометрическое ядро');
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const wasmBinary = await new Response(stream).arrayBuffer();
  return createKernel({ wasmBinary });
}

const kernel = loadKernel();
function run(module, command) {
  const raw = module.ccall('bz_web_request', 'string', ['string'], [JSON.stringify(command)]);
  const response = JSON.parse(raw);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

function clean(fs, directory) {
  for (const name of fs.readdir(directory)) {
    if (name === '.' || name === '..') continue;
    const path = directory + '/' + name;
    if (fs.isDir(fs.stat(path).mode)) clean(fs, path);
    else fs.unlink(path);
  }
  fs.rmdir(directory);
}

self.addEventListener('message', async event => {
  const { id, request } = event.data;
  try {
    const module = await kernel;
    let data;
    const transfer = [];
    if (request.command === 'app.open') {
      const ext = request.name?.match(/\.(bzc|bza|bzp)$/i)?.[1].toLowerCase();
      if (!ext || !(request.bytes instanceof ArrayBuffer)) throw new Error('Выберите файл .bzc, .bza или .bzp');
      if (request.bytes.byteLength > 64 * 1024 * 1024) throw new Error('Размер файла превышает 64 МБ');
      const directory = '/tmp/input-' + id;
      const path = directory + '/model.' + ext;
      module.FS.mkdir(directory);
      try {
        module.FS.writeFile(path, new Uint8Array(request.bytes));
        data = run(module, { command: 'app.open', path, directory: directory + '/project',
          name: request.name.replace(/\.[^.]+$/, ''), discard: request.discard });
      } finally {
        clean(module.FS, directory);
      }
    } else if (request.command === 'doc.save') {
      const path = '/tmp/model.bzc';
      run(module, { command: 'doc.save', path });
      data = module.FS.readFile(path).buffer;
      module.FS.unlink(path);
      transfer.push(data);
    } else {
      data = run(module, request);
      if (request.command === 'view.mesh') {
        data = { triangles: Float32Array.from(data.triangles), segments: Float32Array.from(data.segments) };
        transfer.push(data.triangles.buffer, data.segments.buffer);
      }
    }
    self.postMessage({ id, data }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
