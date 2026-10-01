(() => {
  "use strict";

  const canvas = document.querySelector("#board");
  const ctx = canvas.getContext("2d");
  const appShell = document.querySelector(".app-shell");
  const wrap = document.querySelector(".board-wrap");
  const toolbox = document.querySelector(".toolbox");
  const hint = document.querySelector("#boardHint");
  const status = document.querySelector("#status");
  const textInput = document.querySelector("#textInput");
  const inlineEditor = document.querySelector("#inlineEditor");
  const zoomReset = document.querySelector("#zoomReset");
  const compactMode = document.querySelector("#compactMode");
  const calculator = document.querySelector("#calculator");
  const calculatorToggle = document.querySelector("#calculatorToggle");
  const calculatorClose = document.querySelector("#calculatorClose");
  const calculatorDisplay = document.querySelector("#calculatorDisplay");
  const calculatorGrid = document.querySelector("#calculatorGrid");
  const calculatorUse = document.querySelector("#calculatorUse");
  const fontSize = document.querySelector("#fontSize");
  const strokeWidth = document.querySelector("#strokeWidth");
  const eraserSize = document.querySelector("#eraserSize");
  const eraserSizeQuick = document.querySelector("#eraserSizeQuick");
  const eraserQuickControl = document.querySelector("#eraserQuickControl");
  const selectAllButton = document.querySelector("#selectAll");
  const superscript = document.querySelector("#superscript");
  const showGrid = document.querySelector("#showGrid");
  const STORAGE_KEY = "lousa-matematica-v1";

  let objects = [];
  let undoStack = [];
  let redoStack = [];
  let tool = "select";
  let selectedId = null;
  let selectedIds = new Set();
  let interaction = null;
  let dpr = 1;
  const camera = { zoom: 1, x: 0, y: 0 };
  let saveTimer;
  let statusTimer;
  let compactPreference = null;
  let compactTop = null;
  let compactDrag = null;
  let ignoreCompactClick = false;
  let spaceHeld = false;
  let eraserPreview = null;
  const activePointers = new Map();
  let pinch = null;
  let suppressUntilPointersClear = false;
  const narrowScreen = window.matchMedia("(max-width: 720px), (max-height: 560px)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const boardSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const currentFontSize = () => Number(fontSize.value) * (superscript.checked ? 0.58 : 1);

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    render();
  }

  function drawGrid(width, height) {
    if (!showGrid.checked) return;
    ctx.save();
    ctx.fillStyle = "#292d31";
    const left = -camera.x / camera.zoom;
    const top = -camera.y / camera.zoom;
    const right = left + width / camera.zoom;
    const bottom = top + height / camera.zoom;
    for (let y = Math.floor(top / 24) * 24; y < bottom; y += 24) {
      for (let x = Math.floor(left / 24) * 24; x < right; x += 24) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function render(exporting = false) {
    const { width, height } = boardSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#080a0c";
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y);
    drawGrid(width, height);

    for (const obj of objects) drawObject(obj, exporting);
    if (objects.some(obj => obj.type === "eraser")) restoreErasedBackground(width, height);
    if (!exporting && tool === "real-erase" && eraserPreview) drawEraserPreview();
    if (!exporting && interaction?.type === "marquee") drawSelectionMarquee(interaction);
    hint.style.opacity = objects.some(obj => obj.type !== "eraser") ? "0" : "1";
  }

  function marqueeRect(marquee) {
    return {
      x: Math.min(marquee.start.x, marquee.current.x),
      y: Math.min(marquee.start.y, marquee.current.y),
      w: Math.abs(marquee.current.x - marquee.start.x),
      h: Math.abs(marquee.current.y - marquee.start.y)
    };
  }

  function drawSelectionMarquee(marquee) {
    const rect = marqueeRect(marquee);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(159, 202, 98, .10)";
    ctx.strokeStyle = "#9fca62";
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawEraserPreview() {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(242, 243, 238, .72)";
    ctx.fillStyle = "rgba(242, 243, 238, .08)";
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    ctx.arc(eraserPreview.x, eraserPreview.y, Number(eraserSize.value) / 2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function restoreErasedBackground(width, height) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    drawGrid(width, height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0c";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawObject(obj, exporting) {
    ctx.save();
    ctx.strokeStyle = "#f2f3ee";
    ctx.fillStyle = "#f2f3ee";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (obj.type === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = obj.width;
      ctx.beginPath();
      traceSmoothStroke(obj.points);
      ctx.stroke();
    } else if (obj.type === "path") {
      ctx.lineWidth = obj.width;
      ctx.beginPath();
      obj.points.forEach((p, index) => index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
    } else if (obj.type === "text") {
      ctx.save();
      ctx.font = `${obj.italic ? "italic " : ""}${obj.size}px Georgia, 'Times New Roman', serif`;
      ctx.textBaseline = "top";
      ctx.translate(obj.x, obj.y);
      ctx.scale(obj.scaleX || 1, obj.scaleY || 1);
      ctx.fillText(obj.text, 0, 0);
      ctx.restore();
    } else if (obj.type === "fraction") {
      ctx.lineWidth = Math.max(1, (obj.height || 12) / 6);
      ctx.beginPath(); ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x + obj.length, obj.y); ctx.stroke();
    }

    if (!exporting && (obj.id === selectedId || selectedIds.has(obj.id)) && obj.type !== "eraser") {
      const b = bounds(obj);
      ctx.strokeStyle = "#719d3c";
      ctx.lineWidth = 1 / camera.zoom;
      ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
      ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      if (obj.id === selectedId && selectedIds.size === 0) {
        const handleRadius = (coarsePointer.matches ? 7 : 5) / camera.zoom;
        ctx.setLineDash([]);
        ctx.fillStyle = "#9fca62";
        ctx.strokeStyle = "#182014";
        for (const handle of resizeHandles(obj)) {
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function bounds(obj) {
    if (obj.type === "text") {
      const dimensions = textDimensions(obj);
      return { x: obj.x, y: obj.y, w: dimensions.w, h: dimensions.h };
    }
    if (obj.type === "fraction") {
      const height = obj.height || 12;
      return { x: obj.x, y: obj.y - height / 2, w: obj.length, h: height };
    }
    const xs = obj.points.map(p => p.x), ys = obj.points.map(p => p.y);
    const raw = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const width = Math.max(12, raw.w), height = Math.max(12, raw.h);
    return { x: raw.x - (width - raw.w) / 2, y: raw.y - (height - raw.h) / 2, w: width, h: height };
  }

  function textDimensions(obj) {
    ctx.save();
    ctx.font = `${obj.italic ? "italic " : ""}${obj.size}px Georgia, 'Times New Roman', serif`;
    const width = Math.max(8, ctx.measureText(obj.text).width);
    ctx.restore();
    return { w: width * (obj.scaleX || 1), h: obj.size * 1.15 * (obj.scaleY || 1) };
  }

  function eraseTextByStroke(strokePoints, radius) {
    const rebuilt = [];
    for (const obj of objects) {
      if (obj.type !== "text") { rebuilt.push(obj); continue; }

      const characters = Array.from(obj.text);
      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      const top = obj.y;
      const bottom = obj.y + obj.size * 1.15 * scaleY;
      const offsets = [0];
      ctx.save();
      ctx.font = `${obj.italic ? "italic " : ""}${obj.size}px Georgia, 'Times New Roman', serif`;
      for (let index = 1; index <= characters.length; index++) {
        offsets.push(ctx.measureText(characters.slice(0, index).join("")).width * scaleX);
      }
      ctx.restore();

      const erased = characters.map((character, index) => {
        const left = obj.x + offsets[index];
        const right = obj.x + offsets[index + 1];
        let covered = 0;
        const columns = 8, rows = 10;
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) {
            const sample = {
              x: left + (right - left) * ((column + .5) / columns),
              y: top + (bottom - top) * ((row + .5) / rows)
            };
            if (distanceToStroke(sample, strokePoints) <= radius) covered++;
          }
        }
        return covered / (columns * rows) >= .5;
      });

      if (!erased.some(Boolean)) { rebuilt.push(obj); continue; }

      let runStart = -1;
      for (let index = 0; index <= characters.length; index++) {
        const keep = index < characters.length && !erased[index];
        if (keep && runStart < 0) runStart = index;
        if (!keep && runStart >= 0) {
          rebuilt.push({
            ...obj,
            id: id(),
            text: characters.slice(runStart, index).join(""),
            x: obj.x + offsets[runStart]
          });
          runStart = -1;
        }
      }
    }
    objects = rebuilt;
  }

  function distanceToStroke(point, strokePoints) {
    if (strokePoints.length === 1) return Math.hypot(point.x - strokePoints[0].x, point.y - strokePoints[0].y);
    let nearest = Infinity;
    for (let index = 1; index < strokePoints.length; index++) {
      const start = strokePoints[index - 1], end = strokePoints[index];
      const dx = end.x - start.x, dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const amount = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
        : 0;
      const x = start.x + dx * amount, y = start.y + dy * amount;
      nearest = Math.min(nearest, Math.hypot(point.x - x, point.y - y));
    }
    return nearest;
  }

  function traceSmoothStroke(points) {
    if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.lineTo(points[0].x + .01, points[0].y + .01);
      return;
    }
    for (let index = 1; index < points.length - 1; index++) {
      const midpoint = {
        x: (points[index].x + points[index + 1].x) / 2,
        y: (points[index].y + points[index + 1].y) / 2
      };
      ctx.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  function resizeHandles(obj) {
    const b = bounds(obj);
    return [
      { corner: "nw", x: b.x - 5, y: b.y - 5 },
      { corner: "ne", x: b.x + b.w + 5, y: b.y - 5 },
      { corner: "sw", x: b.x - 5, y: b.y + b.h + 5 },
      { corner: "se", x: b.x + b.w + 5, y: b.y + b.h + 5 }
    ];
  }

  function resizeHandleAt(point) {
    const selected = objects.find(obj => obj.id === selectedId);
    if (!selected) return null;
    const radius = (coarsePointer.matches ? 14 : 7) / camera.zoom;
    return resizeHandles(selected).find(handle => Math.abs(point.x - handle.x) <= radius && Math.abs(point.y - handle.y) <= radius) || null;
  }

  function beginResize(obj, corner, point) {
    const b = bounds(obj);
    const handleAnchors = {
      nw: { x: b.x + b.w, y: b.y + b.h }, ne: { x: b.x, y: b.y + b.h },
      sw: { x: b.x + b.w, y: b.y }, se: { x: b.x, y: b.y }
    };
    const contentAnchors = {
      nw: { x: b.x + b.w, y: b.y + b.h }, ne: { x: b.x, y: b.y + b.h },
      sw: { x: b.x + b.w, y: b.y }, se: { x: b.x, y: b.y }
    };
    const anchor = handleAnchors[corner];
    interaction = {
      type: "resize", obj, corner, anchor,
      vector: { x: point.x - anchor.x, y: point.y - anchor.y },
      contentAnchor: contentAnchors[corner], original: clone(obj), originalBounds: b,
      before: clone(objects)
    };
  }

  function resizeObject(data, point) {
    const current = { x: point.x - data.anchor.x, y: point.y - data.anchor.y };
    const scaleX = Math.max(.08, Math.min(20, current.x / data.vector.x));
    const scaleY = Math.max(.08, Math.min(20, current.y / data.vector.y));
    const original = data.original;

    if (data.obj.type === "text") {
      data.obj.scaleX = (original.scaleX || 1) * scaleX;
      data.obj.scaleY = (original.scaleY || 1) * scaleY;
      const dimensions = textDimensions(data.obj);
      data.obj.x = data.corner === "nw" || data.corner === "sw" ? data.contentAnchor.x - dimensions.w : data.contentAnchor.x;
      data.obj.y = data.corner === "nw" || data.corner === "ne" ? data.contentAnchor.y - dimensions.h : data.contentAnchor.y;
    } else if (data.obj.type === "fraction") {
      data.obj.length = Math.max(8, original.length * scaleX);
      data.obj.height = Math.max(6, (original.height || 12) * scaleY);
      data.obj.x = data.corner === "nw" || data.corner === "sw" ? data.contentAnchor.x - data.obj.length : data.contentAnchor.x;
      data.obj.y = data.corner === "nw" || data.corner === "ne"
        ? data.contentAnchor.y - data.obj.height / 2
        : data.contentAnchor.y + data.obj.height / 2;
    } else if (data.obj.type === "path") {
      data.obj.points = original.points.map(source => ({
        x: data.contentAnchor.x + (source.x - data.contentAnchor.x) * scaleX,
        y: data.contentAnchor.y + (source.y - data.contentAnchor.y) * scaleY
      }));
      data.obj.width = Math.max(.6, original.width * Math.sqrt(scaleX * scaleY));
    }
  }

  function hitTest(point) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.type === "eraser") continue;
      const b = bounds(obj);
      const pad = obj.type === "path" ? Math.max(7, obj.width + 3) : 8;
      if (point.x >= b.x - pad && point.x <= b.x + b.w + pad && point.y >= b.y - pad && point.y <= b.y + b.h + pad) return obj;
    }
    return null;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - camera.x) / camera.zoom,
      y: (event.clientY - rect.top - camera.y) / camera.zoom
    };
  }

  function setZoom(nextZoom, screenX, screenY) {
    const previous = camera.zoom;
    const next = Math.max(.5, Math.min(3, nextZoom));
    const worldX = (screenX - camera.x) / previous;
    const worldY = (screenY - camera.y) / previous;
    camera.zoom = next;
    camera.x = screenX - worldX * next;
    camera.y = screenY - worldY * next;
    zoomReset.textContent = `${Math.round(next * 100)}%`;
    render(); persistSoon();
  }

  function pointerScreenPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pinchGeometry() {
    const points = [...activePointers.values()];
    if (points.length < 2) return null;
    const [first, second] = points;
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
    };
  }

  function beginPinch() {
    const geometry = pinchGeometry();
    if (!geometry || geometry.distance < 1) return;
    if (inlineEditor.style.display === "block") finishInlineEdit(true);
    if (Array.isArray(interaction?.before)) objects = clone(interaction.before);
    interaction = null;
    eraserPreview = null;
    delete wrap.dataset.panning;
    pinch = {
      distance: geometry.distance,
      zoom: camera.zoom,
      worldX: (geometry.center.x - camera.x) / camera.zoom,
      worldY: (geometry.center.y - camera.y) / camera.zoom
    };
    suppressUntilPointersClear = true;
    render();
  }

  function updatePinch() {
    if (!pinch) return;
    const geometry = pinchGeometry();
    if (!geometry) return;
    const next = Math.max(.5, Math.min(3, pinch.zoom * geometry.distance / pinch.distance));
    camera.zoom = next;
    camera.x = geometry.center.x - pinch.worldX * next;
    camera.y = geometry.center.y - pinch.worldY * next;
    zoomReset.textContent = `${Math.round(next * 100)}%`;
    render();
  }

  canvas.addEventListener("wheel", event => {
    if (!event.shiftKey) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const wheelDelta = event.deltaY || event.deltaX;
    const factor = wheelDelta < 0 ? 1.1 : 1 / 1.1;
    setZoom(camera.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  zoomReset.addEventListener("click", () => {
    camera.zoom = 1; camera.x = 0; camera.y = 0;
    zoomReset.textContent = "100%"; render(); persistSoon(); showStatus("Visualização restaurada");
  });

  function commit(previousObjects) {
    undoStack.push(previousObjects);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    persistSoon();
  }

  function addText(value, x, y) {
    const text = value.trim();
    if (!text) return;
    const before = clone(objects);
    const size = currentFontSize();
    const { width, height } = boardSize();
    const slot = objects.filter(obj => obj.type !== "path").length;
    const columns = Math.max(2, Math.floor((width * .55) / 76));
    const stagedX = Math.max(30, width * .2) + (slot % columns) * 76;
    const stagedY = Math.max(36, height * .25) + (Math.floor(slot / columns) % 6) * 54;
    const obj = { id: id(), type: "text", text, x: x ?? stagedX, y: y ?? stagedY, size, scaleX: 1, scaleY: 1, italic: superscript.checked };
    objects.push(obj); selectedIds.clear(); selectedId = obj.id; commit(before); render();
  }

  function addFraction(x, y) {
    const before = clone(objects);
    const { width, height } = boardSize();
    const obj = { id: id(), type: "fraction", x: x ?? width * .45, y: y ?? height * .48, length: 90, height: 12 };
    objects.push(obj); selectedIds.clear(); selectedId = obj.id; commit(before); render();
  }

  function setTool(next) {
    if (next === "multi-select" && selectedId) {
      selectedIds.add(selectedId);
      selectedId = null;
    }
    tool = next;
    canvas.style.cursor = "";
    wrap.dataset.tool = next;
    document.querySelectorAll(".tool").forEach(button => button.classList.toggle("active", button.dataset.tool === next));
    if (next === "text") showStatus("Clique na lousa e digite");
    if (next === "edit-text") showStatus("Clique no texto que deseja editar");
    if (next === "duplicate") showStatus("Clique no item que deseja duplicar");
    if (next === "real-erase") showStatus("Arraste o apagador sobre o que deseja remover");
    if (next === "multi-select") showStatus("Toque nos itens que deseja selecionar");
    if (next !== "real-erase") eraserPreview = null;
    eraserQuickControl.classList.toggle("show", next === "real-erase");
  }

  function applyCompactMode(compact, announce = false) {
    appShell.classList.toggle("compact-ui", compact);
    compactMode.setAttribute("aria-pressed", String(compact));
    compactMode.title = compact ? "Toque para expandir ou segure e arraste para mover" : "Ativar modo discreto (Ctrl+\\)";
    requestAnimationFrame(positionCompactToolbox);
    if (announce) showStatus(compact ? "Modo discreto ativado" : "Painel expandido");
  }

  function positionCompactToolbox(nextTop = compactTop) {
    if (!appShell.classList.contains("compact-ui") || !narrowScreen.matches) return;
    const safeEdge = 8;
    const panelHeight = Math.min(toolbox.scrollHeight, window.innerHeight * .78);
    const maximum = Math.max(safeEdge, window.innerHeight - panelHeight - safeEdge);
    compactTop = Math.max(safeEdge, Math.min(maximum, Number.isFinite(nextTop) ? nextTop : safeEdge));
    toolbox.style.setProperty("--compact-top", `${compactTop}px`);
  }

  function toggleCompactMode() {
    const next = !appShell.classList.contains("compact-ui");
    compactPreference = next;
    applyCompactMode(next, true);
    persistSoon();
  }

  function setCalculatorOpen(open) {
    calculator.hidden = !open;
    calculator.setAttribute("aria-hidden", String(!open));
    calculatorToggle.classList.toggle("active", open);
    if (open) {
      if (narrowScreen.matches) applyCompactMode(true);
      requestAnimationFrame(() => calculatorDisplay.focus());
    }
  }

  function toggleCalculator() {
    setCalculatorOpen(calculator.hidden);
  }

  function calculateExpression() {
    const expression = calculatorDisplay.value
      .replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
    if (!expression.trim() || !/^[\d+\-*/().\s]+$/.test(expression)) {
      calculatorDisplay.value = "Erro";
      return null;
    }
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      if (typeof result !== "number" || !Number.isFinite(result)) throw new Error();
      const rounded = Number.parseFloat(result.toPrecision(12));
      calculatorDisplay.value = String(rounded);
      calculatorDisplay.select();
      return rounded;
    } catch {
      calculatorDisplay.value = "Erro";
      calculatorDisplay.select();
      return null;
    }
  }

  calculatorToggle.addEventListener("click", toggleCalculator);
  calculatorClose.addEventListener("click", () => setCalculatorOpen(false));
  calculatorGrid.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.calcAction;
    if (action === "clear") calculatorDisplay.value = "";
    else if (action === "backspace") calculatorDisplay.value = calculatorDisplay.value.slice(0, -1);
    else if (action === "equals") calculateExpression();
    else if (button.dataset.calcValue) {
      if (calculatorDisplay.value === "Erro") calculatorDisplay.value = "";
      calculatorDisplay.value += button.dataset.calcValue;
    }
    calculatorDisplay.focus();
  });
  calculatorDisplay.addEventListener("input", () => {
    calculatorDisplay.value = calculatorDisplay.value.replace(/[^0-9+\-−*/×÷().,\s]/g, "");
  });
  calculatorDisplay.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === "=") { event.preventDefault(); calculateExpression(); }
    if (event.key === "Escape") { event.preventDefault(); setCalculatorOpen(false); }
  });
  calculatorUse.addEventListener("click", () => {
    const result = calculateExpression();
    if (result === null) return;
    addText(String(result));
    setCalculatorOpen(false);
    showStatus("Resultado adicionado à lousa");
  });

  compactMode.addEventListener("pointerdown", event => {
    if (!appShell.classList.contains("compact-ui") || !narrowScreen.matches || event.button !== 0) return;
    compactDrag = { pointerId: event.pointerId, startY: event.clientY, startTop: toolbox.getBoundingClientRect().top, moved: false };
    compactMode.setPointerCapture(event.pointerId);
  });
  compactMode.addEventListener("pointermove", event => {
    if (!compactDrag || compactDrag.pointerId !== event.pointerId) return;
    const delta = event.clientY - compactDrag.startY;
    if (Math.abs(delta) > 5) compactDrag.moved = true;
    if (compactDrag.moved) {
      event.preventDefault();
      positionCompactToolbox(compactDrag.startTop + delta);
      toolbox.classList.add("dragging");
    }
  });
  function endCompactDrag(event) {
    if (!compactDrag || compactDrag.pointerId !== event.pointerId) return;
    if (compactDrag.moved) {
      ignoreCompactClick = event.type === "pointerup";
      persistSoon();
    }
    toolbox.classList.remove("dragging");
    compactDrag = null;
  }
  compactMode.addEventListener("pointerup", endCompactDrag);
  compactMode.addEventListener("pointercancel", endCompactDrag);
  compactMode.addEventListener("click", event => {
    if (ignoreCompactClick) {
      event.preventDefault();
      ignoreCompactClick = false;
      return;
    }
    toggleCompactMode();
  });
  narrowScreen.addEventListener("change", event => {
    if (compactPreference === null) applyCompactMode(event.matches);
  });

  function moveObject(obj, dx, dy) {
    if (obj.type === "path") obj.points.forEach(p => { p.x += dx; p.y += dy; });
    else { obj.x += dx; obj.y += dy; }
  }

  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    activePointers.set(event.pointerId, pointerScreenPosition(event));
    canvas.setPointerCapture(event.pointerId);
    if (activePointers.size === 2) {
      beginPinch();
      return;
    }
    if (suppressUntilPointersClear) return;
    if (inlineEditor.style.display === "block") finishInlineEdit();
    const point = pointFromEvent(event);
    if (tool === "real-erase") eraserPreview = point;
    const handle = tool === "select" ? resizeHandleAt(point) : null;
    const targetAtPoint = hitTest(point);
    const wantsPan = spaceHeld || event.button === 1 || (tool === "select" && !handle && !targetAtPoint);

    if (wantsPan) {
      canvas.setPointerCapture(event.pointerId);
      interaction = { type: "pan", last: { x: event.clientX, y: event.clientY } };
      wrap.dataset.panning = "true";
      canvas.style.cursor = "grabbing";
      return;
    }

    if (tool === "text") {
      beginInlineEdit(point.x, point.y);
      render();
      return;
    }

    if (tool === "edit-text") {
      const target = hitTest(point);
      if (target?.type === "text") beginInlineEdit(target.x, target.y, target);
      else showStatus("Selecione um texto, número ou símbolo");
      render();
      return;
    }

    if (tool === "multi-select") {
      canvas.setPointerCapture(event.pointerId);
      if (!event.shiftKey) selectedIds.clear();
      selectedId = null;
      interaction = { type: "marquee", start: point, current: point, additive: event.shiftKey };
      render();
      return;
    }

    canvas.setPointerCapture(event.pointerId);

    if (tool === "draw") {
      const obj = { id: id(), type: "path", width: Number(strokeWidth.value), points: [point] };
      const before = clone(objects);
      objects.push(obj); selectedIds.clear(); selectedId = null; interaction = { type: "draw", obj, before };
    } else if (tool === "real-erase") {
      const obj = { id: id(), type: "eraser", width: Number(eraserSize.value), points: [point] };
      const before = clone(objects);
      objects.push(obj);
      selectedIds.clear(); selectedId = null; interaction = { type: "draw", obj, before };
    } else if (tool === "erase") {
      const target = hitTest(point);
      if (target) { interaction = { type: "erase", before: clone(objects) }; objects = objects.filter(obj => obj.id !== target.id); selectedId = null; }
    } else if (tool === "duplicate") {
      const target = hitTest(point);
      if (target) {
        const before = clone(objects);
        const copy = clone(target);
        copy.id = id();
        moveObject(copy, 18, 18);
        objects.push(copy);
        selectedIds.clear();
        selectedId = copy.id;
        setTool("select");
        interaction = { type: "move", obj: copy, last: point, before };
      } else {
        showStatus("Nenhum item encontrado nesse ponto");
      }
    } else if (tool === "fraction") {
      addFraction(point.x - 45, point.y); setTool("select");
    } else {
      if (handle) {
        const target = objects.find(obj => obj.id === selectedId);
        beginResize(target, handle.corner, point);
        render();
        return;
      }
      const target = targetAtPoint;
      if (target && selectedIds.has(target.id)) {
        interaction = { type: "move-group", objects: objects.filter(obj => selectedIds.has(obj.id)), last: point, before: clone(objects) };
        render();
        return;
      }
      selectedIds.clear();
      selectedId = target?.id ?? null;
      if (target?.type === "text") {
        fontSize.value = Math.round(target.size);
        document.querySelector("#fontSizeValue").value = Math.round(target.size);
      }
      interaction = target ? { type: "move", obj: target, last: point, before: clone(objects) } : null;
    }
    render();
  });

  canvas.addEventListener("pointermove", event => {
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, pointerScreenPosition(event));
    if (pinch) {
      updatePinch();
      return;
    }
    if (suppressUntilPointersClear) return;
    if (interaction?.type === "pan") {
      camera.x += event.clientX - interaction.last.x;
      camera.y += event.clientY - interaction.last.y;
      interaction.last = { x: event.clientX, y: event.clientY };
      render();
      return;
    }
    const point = pointFromEvent(event);
    if (interaction?.type === "marquee") {
      interaction.current = point;
      render();
      return;
    }
    if (tool === "real-erase") eraserPreview = point;
    if (!interaction) {
      if (tool === "select") {
        const handle = resizeHandleAt(point);
        canvas.style.cursor = handle
          ? (handle.corner === "nw" || handle.corner === "se" ? "nwse-resize" : "nesw-resize")
          : (hitTest(point) ? "move" : "grab");
      }
      return;
    }
    if (interaction.type === "draw") {
      interaction.obj.points.push(point);
    }
    if (interaction.type === "move") {
      moveObject(interaction.obj, point.x - interaction.last.x, point.y - interaction.last.y);
      interaction.last = point;
    }
    if (interaction.type === "move-group") {
      const dx = point.x - interaction.last.x, dy = point.y - interaction.last.y;
      interaction.objects.forEach(obj => moveObject(obj, dx, dy));
      interaction.last = point;
    }
    if (interaction.type === "resize") resizeObject(interaction, point);
    if (interaction.type === "erase") {
      const target = hitTest(point);
      if (target) objects = objects.filter(obj => obj.id !== target.id);
    }
    render();
  });

  function endInteraction(event) {
    if (event) activePointers.delete(event.pointerId);
    if (suppressUntilPointersClear) {
      if (activePointers.size < 2) pinch = null;
      if (activePointers.size === 0) {
        suppressUntilPointersClear = false;
        persistSoon();
        showStatus(`Zoom ${Math.round(camera.zoom * 100)}%`);
      }
      return;
    }
    if (!interaction) return;
    if (interaction.type === "marquee") {
      const marquee = interaction;
      const rect = marqueeRect(marquee);
      if (rect.w < 4 / camera.zoom && rect.h < 4 / camera.zoom) {
        const target = hitTest(marquee.start);
        if (target) {
          if (marquee.additive && selectedIds.has(target.id)) selectedIds.delete(target.id);
          else selectedIds.add(target.id);
        }
      } else {
        for (const obj of objects) {
          if (obj.type === "eraser") continue;
          const item = bounds(obj);
          const intersects = item.x <= rect.x + rect.w && item.x + item.w >= rect.x && item.y <= rect.y + rect.h && item.y + item.h >= rect.y;
          if (intersects) selectedIds.add(obj.id);
        }
      }
      interaction = null;
      showStatus(`${selectedIds.size} item(ns) selecionado(s)`);
      render();
      return;
    }
    if (interaction.type === "pan") {
      interaction = null;
      delete wrap.dataset.panning;
      canvas.style.cursor = tool === "select" || spaceHeld ? "grab" : "";
      render(); persistSoon();
      return;
    }
    if (interaction.type === "draw" && interaction.obj.type === "eraser") {
      eraseTextByStroke(interaction.obj.points, interaction.obj.width / 2);
    }
    if (interaction.type === "draw" && interaction.obj.points.length === 1) interaction.obj.points.push({ x: interaction.obj.points[0].x + .1, y: interaction.obj.points[0].y + .1 });
    commit(interaction.before); interaction = null; render();
  }
  canvas.addEventListener("pointerup", endInteraction);
  canvas.addEventListener("pointercancel", endInteraction);
  canvas.addEventListener("pointerleave", () => {
    if (!interaction && eraserPreview) { eraserPreview = null; render(); }
  });
  canvas.addEventListener("contextmenu", event => event.preventDefault());

  canvas.addEventListener("dblclick", event => {
    const obj = hitTest(pointFromEvent(event));
    if (obj?.type === "text") beginInlineEdit(obj.x, obj.y, obj);
  });

  function beginInlineEdit(x, y, obj = null) {
    inlineEditor.dataset.id = obj?.id || "";
    inlineEditor.dataset.x = x;
    inlineEditor.dataset.y = y;
    inlineEditor.dataset.italic = String(Boolean(obj?.italic || (!obj && superscript.checked)));
    inlineEditor.value = obj?.text || "";
    const screenX = x * camera.zoom + camera.x;
    const screenY = y * camera.zoom + camera.y;
    inlineEditor.style.fontSize = `${Math.max(16, (obj?.size || currentFontSize()) * camera.zoom)}px`;
    inlineEditor.style.left = `${Math.max(8, Math.min(screenX, canvas.clientWidth - 40))}px`;
    inlineEditor.style.top = `${Math.max(8, Math.min(screenY, canvas.clientHeight - 40))}px`;
    inlineEditor.style.display = "block";
    resizeInlineEditor();
    inlineEditor.focus();
    if (obj) inlineEditor.select();
  }

  function resizeInlineEditor() {
    const fontPixels = Number.parseFloat(inlineEditor.style.fontSize) || 16;
    const boxHeight = Math.max(28, Math.ceil(fontPixels * 1.15 + 7));
    ctx.save();
    ctx.font = `${inlineEditor.dataset.italic === "true" ? "italic " : ""}${fontPixels}px Georgia, 'Times New Roman', serif`;
    const textWidth = ctx.measureText(inlineEditor.value).width;
    ctx.restore();
    const requestedLeft = Number.parseFloat(inlineEditor.style.left) || 8;
    const left = Math.max(8, Math.min(requestedLeft, canvas.clientWidth - boxHeight - 8));
    inlineEditor.style.left = `${left}px`;
    const maximumWidth = Math.max(boxHeight, canvas.clientWidth - left - 8);
    inlineEditor.style.height = `${boxHeight}px`;
    inlineEditor.style.width = `${Math.min(maximumWidth, Math.max(boxHeight, Math.ceil(textWidth + 12)))}px`;
    const top = Number.parseFloat(inlineEditor.style.top) || 8;
    inlineEditor.style.top = `${Math.max(8, Math.min(top, canvas.clientHeight - boxHeight - 8))}px`;
  }

  function finishInlineEdit(cancel = false) {
    if (inlineEditor.style.display !== "block") return;
    const existing = objects.find(obj => obj.id === inlineEditor.dataset.id);
    if (!cancel && inlineEditor.value.trim()) {
      if (existing) { const before = clone(objects); existing.text = inlineEditor.value.trim(); commit(before); }
      else addText(inlineEditor.value, Number(inlineEditor.dataset.x), Number(inlineEditor.dataset.y));
    }
    inlineEditor.style.display = "none";
    inlineEditor.value = "";
    render();
  }
  inlineEditor.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); finishInlineEdit(); }
    if (event.key === "Escape") finishInlineEdit(true);
  });
  inlineEditor.addEventListener("input", resizeInlineEditor);
  inlineEditor.addEventListener("blur", () => finishInlineEdit());

  document.querySelectorAll(".tool").forEach(button => button.addEventListener("click", () => {
    if (!button.dataset.tool) return;
    setTool(button.dataset.tool);
    if (button.dataset.tool === "text") {
      const { width, height } = boardSize();
      beginInlineEdit((width * .38 - camera.x) / camera.zoom, (height * .35 - camera.y) / camera.zoom);
    }
  }));
  document.querySelector("#addText").addEventListener("click", () => { addText(textInput.value); textInput.value = ""; textInput.focus(); });
  textInput.addEventListener("keydown", event => {
    if (event.key === "Enter") { addText(textInput.value); textInput.value = ""; }
  });
  document.querySelector("#symbolGrid").addEventListener("click", event => {
    const symbol = event.target.dataset.symbol;
    if (symbol) addText(symbol);
  });
  selectAllButton.addEventListener("click", () => {
    selectedId = null;
    selectedIds = new Set(objects.filter(obj => obj.type !== "eraser").map(obj => obj.id));
    setTool("select");
    showStatus(`${selectedIds.size} item(ns) selecionado(s)`);
    render();
  });
  fontSize.addEventListener("input", () => {
    document.querySelector("#fontSizeValue").value = fontSize.value;
    const selected = objects.find(obj => obj.id === selectedId && obj.type === "text");
    if (selected) { selected.size = currentFontSize(); persistSoon(); render(); }
  });
  strokeWidth.addEventListener("input", () => document.querySelector("#strokeWidthValue").value = strokeWidth.value);
  function setEraserSize(value) {
    const next = Math.max(6, Math.min(140, Number(value)));
    eraserSize.value = next;
    eraserSizeQuick.value = next;
    document.querySelector("#eraserSizeValue").value = next;
    document.querySelector("#eraserSizeQuickValue").value = next;
    render(); persistSoon();
  }
  eraserSize.addEventListener("input", () => setEraserSize(eraserSize.value));
  eraserSizeQuick.addEventListener("input", () => setEraserSize(eraserSizeQuick.value));
  document.querySelector("#eraserSmaller").addEventListener("click", () => setEraserSize(Number(eraserSize.value) - 4));
  document.querySelector("#eraserLarger").addEventListener("click", () => setEraserSize(Number(eraserSize.value) + 4));
  showGrid.addEventListener("change", () => { persistSoon(); render(); });

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(objects));
    objects = undoStack.pop(); selectedId = null; selectedIds.clear(); persistSoon(); render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(objects));
    objects = redoStack.pop(); selectedId = null; selectedIds.clear(); persistSoon(); render();
  }
  document.querySelector("#undo").addEventListener("click", undo);
  document.querySelector("#redo").addEventListener("click", redo);

  document.querySelector("#clear").addEventListener("click", () => {
    if (!objects.length || !confirm("Limpar toda a lousa?")) return;
    const before = clone(objects); objects = []; selectedId = null; selectedIds.clear(); commit(before); render();
  });

  document.querySelector("#download").addEventListener("click", () => {
    selectedId = null; render(true);
    const link = document.createElement("a");
    link.download = `lousa-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png"); link.click(); render();
  });

  document.addEventListener("keydown", event => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
    if (event.ctrlKey && event.key === "\\") { event.preventDefault(); toggleCompactMode(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); selectAllButton.click(); return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      spaceHeld = true;
      if (!interaction) canvas.style.cursor = "grab";
      return;
    }
    if (event.key.toLowerCase() === "c") { toggleCalculator(); return; }
    const shortcuts = { v: "select", s: "multi-select", p: "draw", e: "erase", a: "real-erase", t: "text", r: "edit-text", d: "duplicate", f: "fraction" };
    if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
    if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedIds.size)) {
      const before = clone(objects);
      objects = objects.filter(obj => obj.id !== selectedId && !selectedIds.has(obj.id));
      selectedId = null; selectedIds.clear(); commit(before); render();
    }
    if (event.key === "Escape") { selectedId = null; selectedIds.clear(); setTool("select"); render(); }
  });
  document.addEventListener("keyup", event => {
    if (event.code !== "Space") return;
    spaceHeld = false;
    if (!interaction) canvas.style.cursor = "";
  });
  window.addEventListener("blur", () => {
    spaceHeld = false;
    if (!interaction) canvas.style.cursor = "";
  });

  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, grid: showGrid.checked, compact: compactPreference, compactTop, camera, eraserSize: Number(eraserSize.value) }));
      showStatus("Salvo automaticamente");
    }, 220);
  }

  function showStatus(message) {
    status.textContent = message; status.classList.add("show"); clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove("show"), 1300);
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved?.objects)) objects = saved.objects;
      showGrid.checked = Boolean(saved?.grid);
      if (typeof saved?.compact === "boolean") compactPreference = saved.compact;
      if (Number.isFinite(saved?.compactTop)) compactTop = saved.compactTop;
      if (Number.isFinite(saved?.eraserSize)) setEraserSize(saved.eraserSize);
      if (saved?.camera && Number.isFinite(saved.camera.x) && Number.isFinite(saved.camera.y) && Number.isFinite(saved.camera.zoom)) {
        camera.x = saved.camera.x;
        camera.y = saved.camera.y;
        camera.zoom = Math.max(.5, Math.min(3, saved.camera.zoom));
        zoomReset.textContent = `${Math.round(camera.zoom * 100)}%`;
      }
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }

  load();
  applyCompactMode(compactPreference ?? narrowScreen.matches);
  setTool("select");
  new ResizeObserver(resize).observe(wrap);
  window.addEventListener("resize", () => { resize(); positionCompactToolbox(); });

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
