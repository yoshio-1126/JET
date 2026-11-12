const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
const world = $('#world');
const ui = $('#site-ui');
const detail = $('#detail');
const loader = $('#loading');
const retry = $('#retry');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const mobileQuery = matchMedia('(max-width: 700px) and (orientation: portrait)');
const ease = 'cubic-bezier(.22, 1, .36, 1)';
const nodes = [];
let state = 'loading';
let trigger;
let assets;
let preloadImages = [];
let opening = 0;
let canvasScale = 1;

function resize() {
  const width = $('#viewport').clientWidth;
  const height = $('#viewport').clientHeight;
  const mobile = mobileQuery.matches;
  canvasScale = mobile ? Math.max(width / 1440, Math.min(height / 1250, .5)) : Math.max(width / 1440, height / 1000);
  root.style.setProperty('--scale', canvasScale);
  root.style.setProperty('--canvas-left', `${(width - 1440 * canvasScale) / 2}px`);
  root.style.setProperty('--canvas-top', `${mobile ? 130 : (height - 1000 * canvasScale) / 2}px`);
  if (state === 'detail') world.style.transform = zoomTransform();
}

function zoomTransform() {
  // The second Figma frame is an exact 2.9614× zoom of the same city.
  if (mobileQuery.matches) return 'translate(-805px, -673px) scale(2.65)';
  return 'translate(-1253.088px, -643.081px) scale(2.961398)';
}

function animate(element, frames, options = {}) {
  const animation = element.animate(frames, {
    duration: motionPreference.matches ? 1 : 800,
    easing: ease,
    fill: 'both',
    ...options,
    ...(motionPreference.matches ? { duration: 1, delay: 0 } : {}),
  });
  return animation;
}

async function finish(animation) {
  try { await animation.finished; } catch { /* A resized or superseded transition can be cancelled. */ }
  if (animation.playState === 'finished') {
    animation.commitStyles();
    animation.cancel();
  }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildCity(scene) {
  for (const layer of scene) {
    const interactive = layer.name === '02_interior 5';
    const element = document.createElement(interactive ? 'button' : 'div');
    element.className = `layer${layer.name === 'bg_paper' ? ' paper' : ''}${interactive ? ' hotspot' : ''}`;
    element.dataset.nodeId = layer.id;
    element.dataset.name = layer.name;
    Object.assign(element.style, { left: `${layer.x}px`, top: `${layer.y}px`, width: `${layer.width}px`, height: `${layer.height}px` });
    if (interactive) {
      element.type = 'button';
      element.setAttribute('aria-label', '内装工事について詳しく見る');
      element.setAttribute('aria-haspopup', 'dialog');
      element.setAttribute('aria-controls', 'detail');
      element.disabled = true;
      element.addEventListener('click', () => openDetail(element));
      trigger = element;
    } else element.setAttribute('aria-hidden', 'true');
    const sprite = document.createElement('span');
    sprite.className = 'sprite';
    sprite.style.width = `${layer.innerWidth ?? layer.width}px`;
    sprite.style.height = `${layer.innerHeight ?? layer.height}px`;
    if (layer.rotation) sprite.style.transform = `rotate(${layer.rotation}deg)${layer.flipY ? ' scaleY(-1)' : ''}`;
    const image = document.createElement('img');
    image.dataset.src = layer.src;
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    sprite.append(image);
    element.append(sprite);
    world.append(element);
    nodes.push({ element, layer });
  }
}

async function preload(url) {
  const image = new Image();
  preloadImages.push(image); // Keep decoded assets alive until scene elements use them.
  image.decoding = 'async';
  image.src = url;
  await Promise.race([
    image.decode(),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Image load timed out')), 30000);
      image.addEventListener('load', () => clearTimeout(timer), { once: true });
      image.addEventListener('error', () => clearTimeout(timer), { once: true });
    }),
  ]);
  if (!image.naturalWidth) throw new Error(`Could not decode ${url}`);
}

async function start() {
  retry.hidden = true;
  $('#loading-label').textContent = '街を準備しています';
  $('#loading-percent').textContent = '0%';
  $('#loading-progress').style.width = '0%';
  try {
    if (!assets) {
      const response = await fetch('scene.json?v=2');
      if (!response.ok) throw new Error('Scene failed to load');
      const scene = await response.json();
      const contentAssets = [...document.querySelectorAll('img[src^="assets/"]')].map((image) => image.getAttribute('src'));
      assets = [...new Set([...scene.map((layer) => layer.src), ...contentAssets])];
      buildCity(scene);
    }
    let complete = 0;
    const queue = [...assets];
    const failures = [];
    // Limit parallel image decoding to avoid a memory spike on phones.
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const url = queue.shift();
        try { await preload(url); } catch (error) { failures.push(error); }
        complete++;
        const percent = Math.round((complete / assets.length) * 100);
        $('#loading-progress').style.width = `${percent}%`;
        $('#loading-percent').textContent = `${percent}%`;
      }
    }));
    if (failures.length) throw failures[0];
    for (const image of world.querySelectorAll('img')) image.src = image.dataset.src;
    await Promise.all([...world.querySelectorAll('img')].map((image) => image.decode()));
    await document.fonts.ready;
    await finish(animate(loader, [{ opacity: 1 }, { opacity: 0 }], { duration: 360 }));
    loader.hidden = true;
    $('#viewport').setAttribute('aria-busy', 'false');
    state = 'intro';
    await intro();
    preloadImages = [];
  } catch (error) {
    console.error(error);
    $('#loading-label').textContent = '画像を読み込めませんでした';
    $('#loading-percent').textContent = '通信環境を確認して、もう一度お試しください';
    retry.hidden = false;
  }
}

async function intro() {
  const paper = nodes.find(({ layer }) => layer.name === 'bg_paper').element;
  // 30° isometric axis: the paper travels from bottom right to top left.
  await finish(animate(paper, [
    { transform: 'translate(1550px, 895px)', opacity: 0 },
    { opacity: 1, offset: .18 },
    { transform: 'translate(0, 0)', opacity: 1 },
  ], { duration: 1450 }));
  const city = shuffle(nodes.filter(({ layer }) => layer.name !== 'bg_paper'));
  const animations = city.map(({ element, layer }, index) => {
    const drop = 55 + Math.random() * 40;
    const drift = (Math.random() - .5) * 18;
    return finish(animate(element, [
      { opacity: 0, transform: `translate(${drift}px, -${drop}px)` },
      { opacity: layer.opacity, transform: 'translate(0, 0)' },
    ], { duration: 850, delay: index * 19 }));
  });
  animations.push(finish(animate(ui, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 950 })));
  await Promise.all(animations);
  ui.inert = false;
  trigger.disabled = false;
  state = 'ready';
  root.dataset.state = state;
}

async function openDetail(origin = trigger) {
  if (state !== 'ready') return;
  state = 'opening';
  detail.returnFocus = origin;
  root.dataset.state = state;
  const operation = ++opening;
  trigger.disabled = true;
  ui.inert = true;
  const sign = nodes.find(({ layer }) => layer.id === '102:5110').element;
  finish(animate(ui, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }));
  finish(animate(sign, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }));
  const from = getComputedStyle(world).transform;
  await finish(animate(world, [{ transform: from }, { transform: zoomTransform() }], { duration: 1300, easing: 'cubic-bezier(.65, 0, .15, 1)' }));
  if (operation !== opening) return;
  detail.hidden = false;
  detail.inert = false;
  const surface = $('.detail-surface');
  await finish(animate(surface, [
    { transform: 'translateY(130px) scale(.96)', opacity: 0 },
    { transform: 'translateY(-5px) scale(1)', opacity: 1, offset: .8 },
    { transform: 'translateY(0) scale(1)', opacity: 1 },
  ], { duration: 750 }));
  if (operation !== opening) return;
  await Promise.all([...detail.querySelectorAll('.detail-item')].map((element, index) => finish(animate(element, [
    { opacity: 0, transform: 'translateY(16px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 550, delay: index * 130 }))));
  if (operation !== opening) return;
  state = 'detail';
  root.dataset.state = state;
  surface.scrollTop = 0;
  $('#detail-title').focus({ preventScroll: true });
}

async function closeDetail() {
  if (!['detail', 'opening'].includes(state)) return;
  ++opening;
  state = 'closing';
  root.dataset.state = state;
  detail.inert = true;
  if (!detail.hidden) await finish(animate($('.detail-surface'), [
    { transform: getComputedStyle($('.detail-surface')).transform, opacity: 1 },
    { transform: 'translateY(70px)', opacity: 0 },
  ], { duration: 350 }));
  detail.hidden = true;
  detail.querySelectorAll('.detail-item').forEach((element) => { element.style.opacity = '0'; });
  // Cancel any unfinished zoom/content motion before returning to the city.
  world.getAnimations().forEach((animation) => { animation.commitStyles(); animation.cancel(); });
  detail.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  await finish(animate(world, [{ transform: getComputedStyle(world).transform }, { transform: 'translate(0, 0) scale(1)' }], { duration: 1050, easing: 'cubic-bezier(.65, 0, .15, 1)' }));
  const sign = nodes.find(({ layer }) => layer.id === '102:5110').element;
  await Promise.all([
    finish(animate(ui, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 })),
    finish(animate(sign, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 })),
  ]);
  state = 'ready';
  root.dataset.state = state;
  ui.inert = false;
  trigger.disabled = false;
  (detail.returnFocus || trigger).focus({ preventScroll: true });
}

$('#back').addEventListener('click', closeDetail);
$('#interior-menu').addEventListener('click', (event) => openDetail(event.currentTarget));
retry.addEventListener('click', start);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDetail();
  if (event.key === 'Tab' && state === 'detail') {
    event.preventDefault();
    $('#back').focus();
  }
});
new ResizeObserver(resize).observe($('#viewport'));
resize();
start();
