import fileFinder from "./fileFinder";
import csvReader from "./csvReader";
import type { ExecutableTool } from "./types";

export type { ExecutableTool, ToolArgs, ToolResult } from "./types";

export const EXECUTABLE_TOOLS: Record<string, ExecutableTool> = {
  file_finder: fileFinder,
  csv_reader:  csvReader,
};

export { fileFinder, csvReader };
