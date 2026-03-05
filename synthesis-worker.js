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
 * @returns {Promise<object>} Parsed Yosys JSON output
 */
async function synthesize(verilogSource) {
  // Collect stderr lines for diagnostics
  const stderrLines = [];

  const yosysCommands = [
    "read_verilog input.v",
    "hierarchy -auto-top",
    "proc",
    "opt",
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

  // Parse and return the JSON
  return JSON.parse(
    typeof jsonString === "string"
      ? jsonString
      : new TextDecoder().decode(jsonString),
  );
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
    const json = await synthesize(verilog);

    self.postMessage({ type: "result", json });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err.message || String(err),
    });
  }
};
