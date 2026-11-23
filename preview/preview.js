import { makeViewport } from './viewport.js';

const byId = id => document.getElementById(id);
const toolbar = document.querySelector('.toolbar');
const panel = byId('panel');
const status = byId('status');
const loading = byId('loading');
const compact = matchMedia('(max-width: 720px)');
const coarse = matchMedia('(pointer: coarse)');
const format = new Intl.NumberFormat('ru', { maximumFractionDigits: 3 });
const defaultStatus = 'Модель обрабатывается в браузере';
const pending = new Map();
const edits = new Set(['app.new_part', 'app.open', 'doc.undo', 'doc.redo', 'sketch.create', 'sketch.add',
  'part.create_feature', 'part.edit_feature']);
const commands = new Set([...edits, 'doc.save', 'part.tree', 'part.feature_types', 'part.feature',
  'part.faces', 'part.edges', 'part.measure', 'part.properties', 'view.mesh', 'assembly.components']);
let worker, viewport, tree, editing, workerError;
let counter = 0, latest = Promise.resolve(), inFlight = 0, navigating = false;

function announce(message = defaultStatus, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function updateInput(touch) { document.body.dataset.input = touch ? 'touch' : 'mouse'; }
function togglePanel(show) {
  panel.hidden = !show;
  byId('tree-toggle').setAttribute('aria-expanded', String(show));
}
updateInput(coarse.matches);
togglePanel(!compact.matches);
coarse.addEventListener('change', event => updateInput(event.matches));
compact.addEventListener('change', event => togglePanel(!event.matches));
document.addEventListener('pointerdown', event => updateInput(event.pointerType !== 'mouse'), { passive: true });

function setBusy() {
  toolbar.inert = !tree || inFlight > 0;
  byId('command').disabled = !tree || inFlight > 0;
}
function callWorker(request, transfer = []) {
  if (workerError) return Promise.reject(workerError);
  const id = ++counter;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ id, request }, transfer); }
    catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
function renderTree(next) {
  tree = next;
  const assembly = next.kind === 'assembly';
  byId('document-name').textContent = (next.name || 'Новая деталь') + (next.dirty ? ' *' : '');
  byId('tree-title').textContent = assembly ? 'Дерево сборки' : 'Дерево модели';
  byId('empty-tree').hidden = next.nodes.length > 0;
  byId('empty-tree').textContent = assembly ? 'В сборке пока нет компонентов.' : 'Здесь появятся эскизы и операции.';
  byId('assembly-note').hidden = !assembly;
  byId('sketch').disabled = assembly;
  byId('extrude').disabled = assembly || !next.nodes.some(node => node.type === 'sketch');
  byId('save').disabled = assembly;
  byId('undo').disabled = !next.undo;
  byId('redo').disabled = !next.redo;
  const nodes = next.nodes.map(node => {
    const li = document.createElement('li');
    const text = document.createElement(node.type === 'extrude' && node.distance ? 'button' : 'span');
    text.textContent = node.name;
    if (text.tagName === 'BUTTON') text.addEventListener('click', () => editExtrusion(node));
    li.append(text);
    if (node.message || node.distance || node.visible === false) {
      const detail = document.createElement('small');
      detail.textContent = node.message || node.distance || 'Скрыт';
      detail.classList.toggle('problem', Boolean(node.message));
      li.append(detail);
    }
    return li;
  });
  byId('tree').replaceChildren(...nodes);
}

async function refresh(result, fit) {
  renderTree(result.tree || result);
  viewport.update(await callWorker({ command: 'view.mesh' }), fit);
  announce(tree.warnings?.[0]);
}

function execute(request) {
  if (!request || !commands.has(request.command)) return Promise.reject(new Error('Неизвестная команда'));
  inFlight++;
  setBusy();
  const run = latest.then(async () => {
    const transfer = request.bytes instanceof ArrayBuffer ? [request.bytes] : [];
    const result = await callWorker(request, transfer);
    if (edits.has(request.command))
      await refresh(result, ['app.new_part', 'app.open', 'sketch.create', 'part.create_feature', 'sketch.add'].includes(request.command));
    if (request.command === 'doc.save') renderTree(await callWorker({ command: 'part.tree' }));
    if (request.command === 'part.measure') viewport.mark(result.from, result.to);
    return result;
  });
  latest = run.catch(error => announce(error.message, true));
  return run.finally(() => {
    inFlight--;
    setBusy();
  });
}

function action(button, fn) {
  byId(button).addEventListener('click', () => Promise.resolve().then(fn).catch(error => announce(error.message, true)));
}
function discardChanges() {
  return !tree?.dirty || window.confirm('Закрыть текущую модель без сохранения? Скачайте .bzc, чтобы сохранить изменения.');
}
function closePreview() {
  if (!discardChanges()) return;
  navigating = true;
  location.assign(new URL('../', location.href));
}

action('close', closePreview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !event.defaultPrevented) closePreview();
});
window.addEventListener('beforeunload', event => {
  if (!navigating && tree?.dirty) event.preventDefault();
});
action('tree-toggle', () => togglePanel(panel.hidden));
action('new', () => discardChanges() && execute({ command: 'app.new_part', discard: true }));
action('open', () => { if (discardChanges()) byId('file').click(); });
byId('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) {
    try { await openFile(file, true); }
    catch (error) { announce(error.message, true); }
  }
});
async function openFile(file, discard = false) {
  if (file.size > 64 * 1024 * 1024) throw new Error('Размер файла превышает 64 МБ');
  return execute({ command: 'app.open', name: file.name, bytes: await file.arrayBuffer(), discard });
}
function downloadPart(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (tree.name || 'BreezeCAD') + '.bzc';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
action('save', async () => downloadPart(await execute({ command: 'doc.save' })));
action('undo', () => execute({ command: 'doc.undo' }));
action('redo', () => execute({ command: 'doc.redo' }));
action('fit', () => viewport.fit());
action('sketch', () => byId('sketch-dialog').showModal());
action('extrude', () => editExtrusion());

for (const cancel of document.querySelectorAll('[data-cancel]'))
  cancel.addEventListener('click', () => cancel.closest('dialog').close());

function submit(id, callback) {
  const form = byId(id);
  const result = document.createElement('output');
  form.insertBefore(result, form.querySelector('.actions'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    result.textContent = '';
    const button = form.querySelector('.primary');
    button.disabled = true;
    try {
      await callback(new FormData(form));
      form.closest('dialog').close();
    } catch (error) {
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  form.closest('dialog').addEventListener('close', () => { result.textContent = ''; });
}

const sketchForm = byId('sketch-form');
sketchForm.elements.type.addEventListener('change', () => {
  const circle = sketchForm.elements.type.value === 'circle';
  byId('width-label').hidden = byId('height-label').hidden = circle;
  byId('radius-label').hidden = !circle;
  sketchForm.elements.width.disabled = sketchForm.elements.height.disabled = circle;
  sketchForm.elements.radius.disabled = !circle;
});
sketchForm.elements.type.dispatchEvent(new Event('change'));
submit('sketch-form', async data => {
  const type = data.get('type');
  const profile = type === 'circle'
    ? { type, center: [0, 0], radius: Number(data.get('radius')) }
    : { type, a: [0, 0], b: [Number(data.get('width')), Number(data.get('height'))] };
  await execute({ command: 'sketch.create', plane: data.get('plane'), profile });
});

function editExtrusion(node) {
  editing = node;
  const form = byId('extrude-form');
  byId('profile-label').hidden = Boolean(node);
  form.elements.sketch.disabled = Boolean(node);
  const sketches = tree.nodes.filter(item => item.type === 'sketch');
  form.elements.sketch.replaceChildren(...sketches.map(item => new Option(item.name, item.id)));
  if (sketches.length) form.elements.sketch.value = sketches.at(-1).id;
  form.elements.distance.value = node?.distance ?? '12 mm';
  byId('extrude-dialog').showModal();
}
submit('extrude-form', async data => {
  const fields = { distance: data.get('distance') };
  if (editing) await execute({ command: 'part.edit_feature', id: editing.id, fields });
  else await execute({ command: 'part.create_feature', type: 'extrude',
    fields: { ...fields, sketch: Number(data.get('sketch')) } });
});

const measureForm = byId('measure-form');
const output = byId('measurement');
action('measure', async () => {
  const props = await execute({ command: 'part.properties' });
  byId('properties').textContent = props
    ? 'Габариты ' + props.size.map(n => format.format(n)).join(' × ') + ' мм · Объём ' + format.format(props.volume) + ' мм³'
    : 'В модели пока нет тел.';
  const faces = props ? await execute({ command: 'part.faces' }) : [];
  const edges = props ? await execute({ command: 'part.edges' }) : [];
  const options = [...faces.map(f => [
    'Грань ' + f.index + ' · ' + format.format(f.area) + ' мм²', 'face:' + f.index
  ]), ...edges.map(e => [
    'Ребро ' + e.index + ' · ' + format.format(e.length) + ' мм' +
      (e.radius > 0 ? ' · R' + format.format(e.radius) : ''), 'edge:' + e.index
  ])];
  for (const select of [measureForm.elements.a, measureForm.elements.b])
    select.replaceChildren(new Option('Выберите грань или ребро', ''), ...options.map(args => new Option(...args)));
  output.textContent = '';
  byId('measure-dialog').showModal();
});
measureForm.addEventListener('submit', event => event.preventDefault());
measureForm.addEventListener('change', async () => {
  const [a, b] = [measureForm.elements.a.value, measureForm.elements.b.value];
  if (!a || !b) { output.textContent = ''; return; }
  function item(value) {
    const [kind, index] = value.split(':');
    return { face: kind === 'face', index: Number(index) };
  }
  try {
    const result = await execute({ command: 'part.measure', a: item(a), b: item(b) });
    output.textContent = 'Расстояние ' + format.format(result.distance) + ' мм' +
      (result.angle === undefined ? '' : ' · Угол ' + format.format(result.angle * 180 / Math.PI) + '°');
  } catch (error) { output.textContent = error.message; }
});

const commandForm = byId('command-form');
const commandResult = byId('command-result');
action('command', () => byId('command-dialog').showModal());
commandForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = commandForm.querySelector('button.primary');
  button.disabled = true;
  try {
    const request = JSON.parse(commandForm.elements.request.value);
    if (request.command === 'app.open') throw new Error('Откройте файл через кнопку «Открыть»');
    let value = await execute(request);
    if (request.command === 'doc.save') {
      downloadPart(value);
      value = { bytes: value.byteLength };
    } else if (request.command === 'view.mesh') {
      value = { triangles: value.triangles.length / 9, segments: value.segments.length / 6 };
    }
    commandResult.textContent = JSON.stringify(value, null, 2);
  } catch (error) {
    commandResult.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function start() {
  viewport = makeViewport(byId('view'));
  worker = new Worker(new URL('./kernel-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id);
    if (data.error) call.reject(new Error(data.error));
    else call.resolve(data.data);
  });
  worker.addEventListener('error', () => {
    workerError = new Error('Геометрическое ядро не запустилось. Обновите страницу и попробуйте снова.');
    for (const call of pending.values()) call.reject(workerError);
    pending.clear();
    announce(workerError.message, true);
    loading.hidden = false;
    loading.textContent = workerError.message;
    worker.terminate();
  });
  await refresh(await callWorker({ command: 'part.tree' }), true);
  const result = await fetch('./runtime/bracket.bzc');
  if (result.ok) await openFile(new File([await result.blob()], 'Кронштейн.bzc'));
  loading.hidden = true;
  setBusy();
  Object.defineProperty(window, 'BreezeCAD', { value: Object.freeze({
    execute,
    openFile,
    capture: () => viewport.capture(),
    commands: Object.freeze([...commands])
  }) });
}

start().catch(error => {
  loading.textContent = error.message;
  loading.hidden = false;
  announce(error.message, true);
});
