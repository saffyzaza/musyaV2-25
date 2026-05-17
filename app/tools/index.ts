import fileFinder from "./fileFinder";
import csvReader from "./csvReader";
import multiCsvReader from "./multiCsvReader";
import aiCsvAnalyzer from "./aiCsvAnalyzer";
import type { ExecutableTool } from "./types";

export type { ExecutableTool, ToolArgs, ToolResult, AIHelper } from "./types";

export const EXECUTABLE_TOOLS: Record<string, ExecutableTool> = {
  file_finder:      fileFinder,
  csv_reader:       csvReader,
  multi_csv_reader: multiCsvReader,
  ai_csv_analyzer:  aiCsvAnalyzer,
};

export { fileFinder, csvReader, multiCsvReader, aiCsvAnalyzer };
