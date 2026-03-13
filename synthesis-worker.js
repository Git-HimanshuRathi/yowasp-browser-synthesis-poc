import {
  runYosys,
  Exit,
} from "https://cdn.jsdelivr.net/npm/@yowasp/yosys/gen/bundle.js";

/**
 * Run Yosys synthesis on Verilog source code.
 *
 * Uses a simplified flow (no full `synth`) to keep output clean:
 *   read_verilog → hierarchy -auto-top → proc → opt → write_json
 *
 * - `hierarchy -auto-top` automatically detects the top module
 * - `proc` converts processes to netlists
 * - `opt` performs basic optimizations
 * - `write_json` outputs the Yosys JSON netlist format
 *
 * @param {string} verilogSource - The Verilog source code
 * @returns {Promise<{json: object, warnings: string[]}>} Parsed JSON + warnings
 */
async function synthesize(verilogSource) {
  // Collect stderr lines for diagnostics
  const stderrLines = [];

  const yosysCommands = [
    "read_verilog input.v",
    "hierarchy -auto-top",
    "proc",
    "opt",
    "check",
    "write_json output.json",
  ].join("; ");

  let filesOut;
  try {
    filesOut = await runYosys(
      ["input.v", "-p", yosysCommands],
      { "input.v": verilogSource },
      {
        stderr(bytes) {
          if (bytes !== null) {
            const text = new TextDecoder().decode(bytes);
            stderrLines.push(text);
          }
        },
      },
    );
  } catch (err) {
    if (err instanceof Exit) {
      // Yosys exited with non-zero code — extract diagnostics
      const diagnostic = stderrLines.join("");
      throw new Error(`Yosys exited with code ${err.code}.\n\n${diagnostic}`);
    }
    throw err;
  }

  // Extract the JSON output file from the virtual filesystem
  const jsonString = filesOut["output.json"];
  if (!jsonString) {
    throw new Error(
      "Yosys did not produce output.json.\n\nStderr:\n" + stderrLines.join(""),
    );
  }

  // Parse warnings from Yosys stderr (if any)
  const fullStderr = stderrLines.join("");
  const stderrWarnings = fullStderr
    .split("\n")
    .filter((line) => /warning/i.test(line))
    .map((line) => line.replace(/^.*?Warning:\s*/i, "").trim())
    .filter((line) => line.length > 0);

  // Parse the JSON output
  const json = JSON.parse(
    typeof jsonString === "string"
      ? jsonString
      : new TextDecoder().decode(jsonString),
  );

  // Analyze the synthesized design for common issues
  const analysisWarnings = analyzeDesign(json);

  // Combine stderr warnings + analysis warnings (deduplicated)
  const warnings = [...new Set([...stderrWarnings, ...analysisWarnings])];

  return { json, warnings };
}

/**
 * Analyze the synthesized JSON netlist for common design issues.
 * Generates human-readable warnings for latches, unused ports, etc.
 */
function analyzeDesign(json) {
  const warnings = [];
  const modules = json.modules || {};

  for (const [modName, mod] of Object.entries(modules)) {
    const cells = mod.cells || {};
    const ports = mod.ports || {};
    const netnames = mod.netnames || {};

    // Detect latch inference ($dlatch, $sr, $adlatch cells)
    const latchTypes = ["$dlatch", "$sr", "$adlatch", "$dlatchsr"];
    for (const [cellName, cell] of Object.entries(cells)) {
      if (latchTypes.includes(cell.type)) {
        warnings.push(
          `Latch inferred in module '${modName}' — cell '${cell.type}' created. This usually means an incomplete if/case statement in combinational logic.`,
        );
      }
    }

    // Detect undriven output ports (connected to constant 'x')
    for (const [portName, portInfo] of Object.entries(ports)) {
      if (portInfo.direction === "output" && portInfo.bits) {
        const allX = portInfo.bits.every((b) => b === "x");
        if (allX) {
          warnings.push(
            `Output port '${portName}' in module '${modName}' appears undriven.`,
          );
        }
      }
    }

    // Detect unused input ports (not connected to any cell)
    const usedBits = new Set();
    for (const cell of Object.values(cells)) {
      const connections = cell.connections || {};
      for (const bits of Object.values(connections)) {
        for (const bit of bits) {
          if (typeof bit === "number") usedBits.add(bit);
        }
      }
    }
    // Also count bits used by output ports
    for (const [portName, portInfo] of Object.entries(ports)) {
      if (portInfo.direction === "output" && portInfo.bits) {
        for (const bit of portInfo.bits) {
          if (typeof bit === "number") usedBits.add(bit);
        }
      }
    }
    for (const [portName, portInfo] of Object.entries(ports)) {
      if (portInfo.direction === "input" && portInfo.bits) {
        const portBitsUsed = portInfo.bits.some(
          (b) => typeof b === "number" && usedBits.has(b),
        );
        if (!portBitsUsed) {
          warnings.push(
            `Input port '${portName}' in module '${modName}' is unused — not connected to any logic.`,
          );
        }
      }
    }
  }

  return warnings;
}

// ── Message handler ──────────────────────────────────────────────────

self.onmessage = async function (event) {
  const { type, verilog } = event.data;

  if (type !== "synthesize") return;

  try {
    self.postMessage({
      type: "status",
      message: "Loading YoWASP WASM binary…",
    });

    self.postMessage({ type: "status", message: "Running Yosys synthesis…" });
    const { json, warnings } = await synthesize(verilog);

    self.postMessage({ type: "result", json, warnings });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err.message || String(err),
    });
  }
};
