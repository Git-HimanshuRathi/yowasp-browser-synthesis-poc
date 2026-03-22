# YoWASP Browser Synthesis PoC

**Browser-based Verilog synthesis** using [YoWASP](https://yowasp.org/) (Yosys compiled to WebAssembly) + [yosys2digitaljs](https://github.com/tilk/yosys2digitaljs) (Yosys JSON → DigitalJS conversion), running entirely client-side inside a Web Worker.

> **Proof of Concept** for [CircuitVerse](https://github.com/CircuitVerse/CircuitVerse) — _Project 7: Client-Side Verilog Synthesis_

## Current Setup vs This PoC

### Current CircuitVerse (Server-Side Synthesis)

```
User writes Verilog in browser
        ↓
HTTP request sent to Rails server
        ↓
Server writes Verilog to temp file on disk
        ↓
Server spawns Yosys as a subprocess (Open3.popen3)
        ↓
Yosys (native binary) runs on the server
        ↓
JSON output → yosys2digitaljs converter (Ruby)
        ↓
Response sent back to browser
```

- Yosys runs **on the server** as a native Linux binary
- Every synthesis requires a **network round-trip** HTTP request
- Server handles **temp file I/O**, **process spawning**, and a **20-second timeout**
- Each user consumes **server CPU and memory**
- A Ruby `VerilogValidator` pre-validates syntax before calling Yosys
- A Ruby `Converter` transforms Yosys JSON into DigitalJS format

### This PoC (Client-Side Synthesis)

```
User writes Verilog in browser
        ↓
Main thread sends Verilog to Web Worker          ← main.js
        ↓
Web Worker runs YoWASP (Yosys via WASM)          ← synthesis-worker.js
        ↓
Yosys: read_verilog → hierarchy → proc → opt → write_json
        ↓
Yosys JSON → yosys2digitaljs (npm) → DigitalJS JSON
        ↓
Worker sends both JSONs + warnings back to main thread
        ↓
Browser displays parsed summary + DigitalJS output ← main.js
```

- Yosys runs **entirely in the browser** via WebAssembly (YoWASP)
- **yosys2digitaljs npm package** converts Yosys JSON → DigitalJS JSON (the same package CircuitVerse's Ruby gem was ported from)
- **Zero server dependency** — no HTTP requests, no server load
- **Web Worker** keeps the UI responsive during synthesis
- Warnings from Yosys stderr are parsed and displayed
- No build step — pure vanilla JS with ES Modules (CDN imports via [esm.sh](https://esm.sh))

### Comparison

| Aspect | Current (Server-Side) | PoC (Client-Side) |
|---|---|---|
| **Where Yosys runs** | Server (native binary) | Browser (WebAssembly) |
| **Network required** | Yes (HTTP per synthesis) | No (fully offline-capable) |
| **Server load** | High (CPU + memory per user) | Zero |
| **Latency** | Network round-trip + server queue | Instant (local execution) |
| **Scalability** | Limited by server resources | Unlimited (each browser independent) |
| **Yosys installation** | Required on server | None (WASM from CDN) |
| **JSON conversion** | Ruby gem (server) | yosys2digitaljs npm (browser) |
| **Offline support** | No | Yes (after initial WASM cache) |


## Architecture

```
├── index.html            # Page with Verilog editor + output panels
├── style.css             # UI styles (CircuitVerse visual language)
├── main.js               # Main thread: UI, worker communication, Yosys + DigitalJS rendering
├── synthesis-worker.js   # Web Worker: YoWASP Yosys + yosys2digitaljs conversion
└── README.md
```

### Full Pipeline

```
read_verilog input.v    →  Parse the Verilog source
hierarchy -auto-top     →  Auto-detect the top module
proc                    →  Convert processes to netlists
opt                     →  Basic optimizations
check                   →  Validate design
write_json output.json  →  Output Yosys JSON netlist
        ↓
yosys2digitaljs(json)   →  Convert Yosys JSON → DigitalJS JSON
io_ui(output)           →  Assign UI components (Button, Lamp, etc.)
```

### Key Dependencies (loaded via CDN, no build step)

- **@yowasp/yosys** — Yosys compiled to WebAssembly
- **yosys2digitaljs** — Yosys JSON → DigitalJS JSON converter (via [esm.sh](https://esm.sh))