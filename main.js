// main.js
// =====================================================================
// Main thread logic for the YoWASP Browser Synthesis PoC.
// Manages UI, sends Verilog to the Web Worker, and displays results.
// =====================================================================

// ── Example Circuits ────────────────────────────────────────────────

const EXAMPLES = {
  half_adder: `// Half Adder — basic combinational logic
module half_adder(
    input  a,
    input  b,
    output sum,
    output carry
);
    assign sum   = a ^ b;
    assign carry = a & b;
endmodule`,

  sr_latch: `// SR Latch — sequential element with feedback
module sr_latch(
    input  S,
    input  R,
    output reg Q,
    output reg Qn
);
    always @(*) begin
        if (S && !R) begin
            Q  = 1'b1;
            Qn = 1'b0;
        end else if (!S && R) begin
            Q  = 1'b0;
            Qn = 1'b1;
        end
    end
endmodule`,

  mux2to1: `// 2:1 Multiplexer — data selection
module mux2to1(
    input  a,
    input  b,
    input  sel,
    output y
);
    assign y = sel ? b : a;
endmodule`,
};

// ── DOM References ──────────────────────────────────────────────────

const verilogInput = document.getElementById("verilog-input");
const runBtn = document.getElementById("run-btn");
const exampleSelect = document.getElementById("example-select");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const errorPanel = document.getElementById("error-panel");
const errorMessage = document.getElementById("error-message");
const warningPanel = document.getElementById("warning-panel");
const warningList = document.getElementById("warning-list");
const parsedSummary = document.getElementById("parsed-summary");
const summaryContent = document.getElementById("summary-content");
const rawJsonSection = document.getElementById("raw-json-section");
const rawJsonPre = document.getElementById("raw-json");
const toggleJsonBtn = document.getElementById("toggle-json");
const timingBadge = document.getElementById("timing");
const placeholder = document.getElementById("placeholder");

// ── Worker Setup ────────────────────────────────────────────────────

// We use a module Web Worker so we can use top-level `import` to load
// @yowasp/yosys from the CDN inside the worker script.
const worker = new Worker("synthesis-worker.js", { type: "module" });

let synthesisStartTime = 0;

worker.onmessage = function (event) {
  const { type, json, warnings, message } = event.data;

  switch (type) {
    case "status":
      showStatus(message);
      break;

    case "result":
      onSynthesisResult(json, warnings || []);
      break;

    case "error":
      onSynthesisError(message);
      break;
  }
};

worker.onerror = function (err) {
  onSynthesisError(`Worker error: ${err.message}`);
};

// ── Event Handlers ──────────────────────────────────────────────────

runBtn.addEventListener("click", runSynthesis);

// Ctrl+Enter / Cmd+Enter shortcut
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runSynthesis();
  }
});

exampleSelect.addEventListener("change", () => {
  verilogInput.value = EXAMPLES[exampleSelect.value] || "";
});

toggleJsonBtn.addEventListener("click", () => {
  rawJsonPre.classList.toggle("hidden");
  toggleJsonBtn.textContent = rawJsonPre.classList.contains("hidden")
    ? "Show"
    : "Hide";
});

// ── Initialize ──────────────────────────────────────────────────────

verilogInput.value = EXAMPLES.half_adder;

// ── Core Functions ──────────────────────────────────────────────────

function runSynthesis() {
  const verilog = verilogInput.value.trim();
  if (!verilog) return;

  // Reset UI
  hideAll();
  showStatus("Sending Verilog to Web Worker…");
  runBtn.disabled = true;
  runBtn.querySelector(".btn-text").textContent = "Running…";

  // Record start time for performance measurement
  synthesisStartTime = performance.now();

  // Send to worker
  worker.postMessage({ type: "synthesize", verilog });
}

function onSynthesisResult(json, warnings) {
  const elapsed = ((performance.now() - synthesisStartTime) / 1000).toFixed(2);

  hideAll();
  runBtn.disabled = false;
  runBtn.querySelector(".btn-text").textContent = "Run Synthesis";

  // Show timing
  timingBadge.textContent = `✓ ${elapsed}s`;
  timingBadge.classList.remove("hidden");

  // Show warnings if any
  if (warnings.length > 0) {
    warningList.innerHTML = "";
    for (const w of warnings) {
      const li = document.createElement("li");
      li.textContent = w;
      warningList.appendChild(li);
    }
    warningPanel.classList.remove("hidden");
  }

  // Show parsed summary
  renderParsedSummary(json);
  parsedSummary.classList.remove("hidden");

  // Prepare raw JSON (hidden by default)
  rawJsonPre.textContent = JSON.stringify(json, null, 2);
  rawJsonPre.classList.add("hidden");
  toggleJsonBtn.textContent = "Show";
  rawJsonSection.classList.remove("hidden");
}

function onSynthesisError(msg) {
  hideAll();
  runBtn.disabled = false;
  runBtn.querySelector(".btn-text").textContent = "Run Synthesis";

  errorMessage.textContent = msg;
  errorPanel.classList.remove("hidden");
}

// ── UI Helpers ──────────────────────────────────────────────────────

function hideAll() {
  statusBar.classList.add("hidden");
  errorPanel.classList.add("hidden");
  warningPanel.classList.add("hidden");
  parsedSummary.classList.add("hidden");
  rawJsonSection.classList.add("hidden");
  timingBadge.classList.add("hidden");
  placeholder.classList.add("hidden");
}

function showStatus(msg) {
  placeholder.classList.add("hidden");
  errorPanel.classList.add("hidden");
  statusBar.classList.remove("hidden");
  statusText.textContent = msg;
}

// ── JSON Parser & Renderer ──────────────────────────────────────────

function renderParsedSummary(json) {
  summaryContent.innerHTML = "";

  const modules = json.modules || {};
  const moduleNames = Object.keys(modules);

  if (moduleNames.length === 0) {
    summaryContent.innerHTML =
      '<p style="color: var(--text-muted)">No modules found in output.</p>';
    return;
  }

  for (const modName of moduleNames) {
    const mod = modules[modName];
    const block = document.createElement("div");
    block.className = "module-block";

    // Module name
    const nameEl = document.createElement("div");
    nameEl.className = "module-name";
    nameEl.textContent = modName;
    block.appendChild(nameEl);

    // ── Cells ───────────────────────────────
    const cells = mod.cells || {};
    const cellEntries = Object.values(cells);

    if (cellEntries.length > 0) {
      // Count cell types
      const typeCounts = {};
      for (const cell of cellEntries) {
        const t = cell.type || "unknown";
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }

      const cellLabel = document.createElement("div");
      cellLabel.className = "section-label";
      cellLabel.textContent = "Cells";
      block.appendChild(cellLabel);

      const cellList = document.createElement("ul");
      cellList.className = "cell-list";
      for (const [cellType, count] of Object.entries(typeCounts)) {
        const li = document.createElement("li");
        li.className = "cell-item";
        li.innerHTML = `<span class="cell-type">${escapeHtml(cellType)}</span><span class="cell-count">× ${count}</span>`;
        cellList.appendChild(li);
      }
      block.appendChild(cellList);
    } else {
      const noCells = document.createElement("div");
      noCells.className = "section-label";
      noCells.textContent = "Cells: none";
      noCells.style.color = "var(--text-muted)";
      block.appendChild(noCells);
    }

    // ── Ports ───────────────────────────────
    const ports = mod.ports || {};
    const portEntries = Object.entries(ports);

    if (portEntries.length > 0) {
      const portLabel = document.createElement("div");
      portLabel.className = "section-label";
      portLabel.textContent = "Ports";
      block.appendChild(portLabel);

      const portList = document.createElement("ul");
      portList.className = "port-list";
      for (const [portName, portInfo] of portEntries) {
        const dir = (portInfo.direction || "unknown").toLowerCase();
        const li = document.createElement("li");
        li.className = "port-item";
        li.innerHTML = `<span class="port-name">${escapeHtml(portName)}</span><span class="port-dir ${dir}">${dir}</span>`;
        portList.appendChild(li);
      }
      block.appendChild(portList);
    }

    summaryContent.appendChild(block);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
