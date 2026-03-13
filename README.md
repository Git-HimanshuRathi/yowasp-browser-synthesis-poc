# YoWASP Browser Synthesis PoC

**Browser-based Verilog synthesis** using [YoWASP](https://yowasp.org/) (Yosys compiled to WebAssembly), running entirely client-side inside a Web Worker.

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
Main thread sends Verilog to Web Worker     ← main.js
        ↓
Web Worker runs YoWASP (Yosys via WASM)     ← synthesis-worker.js
        ↓
Yosys: read_verilog → hierarchy → proc → opt → write_json
        ↓
Worker sends JSON + warnings back to main thread
        ↓
Browser displays parsed netlist + warnings  ← main.js
```

- Yosys runs **entirely in the browser** via WebAssembly (YoWASP)
- **Zero server dependency** — no HTTP requests, no server load
- **Web Worker** keeps the UI responsive during synthesis
- Warnings from Yosys stderr are parsed and displayed
- No build step — pure vanilla JS with ES Modules

### Comparison

| Aspect | Current (Server-Side) | PoC (Client-Side) |
|---|---|---|
| **Where Yosys runs** | Server (native binary) | Browser (WebAssembly) |
| **Network required** | Yes (HTTP per synthesis) | No (fully offline-capable) |
| **Server load** | High (CPU + memory per user) | Zero |
| **Latency** | Network round-trip + server queue | Instant (local execution) |
| **Scalability** | Limited by server resources | Unlimited (each browser independent) |
| **Yosys installation** | Required on server | None (WASM from CDN) |
| **Offline support** | No | Yes (after initial WASM cache) |


## Architecture

```
├── index.html            # Page with Verilog editor + output panel
├── style.css             # UI styles (CircuitVerse visual language)
├── main.js               # Main thread: UI logic, worker communication, JSON parsing
├── synthesis-worker.js   # Web Worker: loads YoWASP, runs Yosys, extracts warnings
└── README.md
```

### Yosys Command Pipeline

```
read_verilog input.v    →  Parse the Verilog source
hierarchy -auto-top     →  Auto-detect the top module
proc                    →  Convert processes to netlists
opt                     →  Basic optimizations
write_json output.json  →  Output Yosys JSON netlist
```