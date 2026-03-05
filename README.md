# YoWASP Browser Synthesis PoC

**Browser-based Verilog synthesis** using [YoWASP](https://yowasp.org/) (Yosys compiled to WebAssembly), running entirely client-side inside a Web Worker.

> **Proof of Concept** for [CircuitVerse](https://github.com/CircuitVerse/CircuitVerse) — _Project 7: Client-Side Verilog Synthesis_

## What This Proves

| Technical Risk                                    | How It's Validated                                  |
| ------------------------------------------------- | --------------------------------------------------- |
| Running Yosys (YoWASP) in the browser             | WASM binary loads and executes successfully         |
| Executing inside a Web Worker without blocking UI | UI stays responsive during synthesis                |
| Producing valid Yosys JSON output                 | `write_json` generates valid JSON netlist           |
| Parsing that JSON in JavaScript                   | Parsed summary shows modules, cell types, and ports |

## Architecture

```
User clicks "Run Synthesis"
        ↓
Main thread sends Verilog to Worker   ← main.js
        ↓
Worker runs YoWASP (Yosys via WASM)   ← synthesis-worker.js
        ↓
Yosys generates JSON netlist
        ↓
Worker sends JSON back
        ↓
Browser displays parsed result        ← main.js
```

### Why a Web Worker?

Yosys compilation can take several seconds for large circuits. Running YoWASP inside a Web Worker **prevents blocking the browser UI thread**, keeping the page fully responsive during synthesis. This is a critical architectural decision for the full CircuitVerse integration.

### Yosys Command Flow

We use a simplified flow (no full `synth`) to keep the output readable and prove the pipeline works:

```
read_verilog input.v    # Parse the Verilog source
hierarchy -auto-top     # Auto-detect the top module
proc                    # Convert processes to netlists
opt                     # Basic optimizations
write_json output.json  # Output Yosys JSON format
```

## How to Run

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Git-HimanshuRathi/yowasp-browser-synthesis-poc.git
   cd yowasp-browser-synthesis-poc
   ```

2. **Start a local HTTP server** (required for ES Module Workers):

   ```bash
   python3 -m http.server 8080
   ```

3. **Open in browser:**

   ```
   http://localhost:8080
   ```

4. **Click "Run Synthesis"** and observe the output.

> **Note:** The WASM binary (~17 MB) is fetched from jsDelivr CDN on first load. Subsequent runs use the browser cache and are much faster.

## Example Output

For the **Half Adder** circuit:

```
Module: half_adder

Cells:
$_XOR_ × 1
$_AND_ × 1

Ports:
a        (input)
b        (input)
sum      (output)
carry    (output)

Synthesis completed in 2.35s
```

## Tech Stack

- **YoWASP** — Yosys compiled to WebAssembly, loaded from CDN
- **Web Workers** — Off-main-thread execution
- **Vanilla JS/HTML/CSS** — No build step, no bundler, no framework
- **ES Modules** — Native browser module system

## Project Structure

```
├── index.html            # Main page with editor + output panel
├── style.css             # UI styles
├── main.js               # Main thread: UI logic, worker communication
├── synthesis-worker.js   # Web Worker: loads YoWASP, runs Yosys
└── README.md
```

## License

MIT
