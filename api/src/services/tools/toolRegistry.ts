// ─── Tool Registry & Executor ───────────────────────────────────────────────
// Central registry for all executable tools. Handles schema validation,
// parameter sanitization, and safe execution of pre-registered tool functions.
//
// Security: Tools NEVER execute arbitrary code/SQL/shell commands. Each tool is
// a pre-registered TypeScript function with validated parameters.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ToolExecutionResult,
  LLMToolDefinition,
  ToolParameterDef,
} from "@voiceflow/shared";
import type { IToolDocument } from "../../models/Tool.js";

// ─── Tool Handler Function Signature ─────────────────────────────────────────

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

export interface ToolExecutionContext {
  agentId: string;
  organizationId: string;
  conversationId: string;
  sessionId?: string;
}

// ─── Built-in Tool Handlers ──────────────────────────────────────────────────

/**
 * check_order: Looks up an order by ID and returns tracking status.
 * Risk: Low — read-only operation with no side effects.
 */
async function checkOrderHandler(
  params: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const start = performance.now();
  const orderId = String(params.orderId || "").trim();

  if (!orderId) {
    return {
      success: false,
      data: {},
      error: "Order ID is required",
      durationMs: Math.round(performance.now() - start),
    };
  }

  // Simulate an order lookup (in production, this would call your OMS API)
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 80));

  // Generate deterministic demo data based on orderId hash
  const hash = orderId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const statuses = ["processing", "shipped", "out_for_delivery", "delivered"];
  const carriers = ["FedEx", "UPS", "USPS", "DHL"];
  const status = statuses[hash % statuses.length];
  const carrier = carriers[hash % carriers.length];

  const daysMap: Record<string, number> = {
    processing: 3,
    shipped: 2,
    out_for_delivery: 0,
    delivered: -1,
  };
  const estimatedDays = daysMap[status] ?? 2;
  const estimatedDelivery =
    estimatedDays >= 0
      ? new Date(Date.now() + estimatedDays * 86400000).toISOString().split("T")[0]
      : "Already delivered";

  return {
    success: true,
    data: {
      orderId,
      status,
      carrier,
      trackingNumber: `${carrier.toUpperCase().slice(0, 2)}${Date.now().toString(36).toUpperCase()}`,
      estimatedDelivery,
      items: [
        { name: "Premium Widget", quantity: hash % 3 + 1, price: 29.99 },
      ],
      totalAmount: (29.99 * (hash % 3 + 1)).toFixed(2),
    },
    durationMs: Math.round(performance.now() - start),
  };
}

/**
 * search_product: Searches a product catalog by query, category, and price.
 * Risk: Low — read-only catalog search.
 */
async function searchProductHandler(
  params: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const start = performance.now();
  const query = String(params.query || "").trim().toLowerCase();
  const category = params.category ? String(params.category).toLowerCase() : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  if (!query) {
    return {
      success: false,
      data: {},
      error: "Search query is required",
      durationMs: Math.round(performance.now() - start),
    };
  }

  // Simulated product catalog
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 60));

  const catalog = [
    { id: "P001", name: "Wireless Bluetooth Earbuds Pro", category: "electronics", price: 79.99, inStock: true, rating: 4.7 },
    { id: "P002", name: "Smart Home Hub Controller", category: "electronics", price: 129.99, inStock: true, rating: 4.5 },
    { id: "P003", name: "Organic Green Tea Collection", category: "food", price: 24.99, inStock: true, rating: 4.8 },
    { id: "P004", name: "Ergonomic Office Chair", category: "furniture", price: 349.99, inStock: false, rating: 4.6 },
    { id: "P005", name: "Premium Yoga Mat", category: "fitness", price: 45.99, inStock: true, rating: 4.9 },
    { id: "P006", name: "Stainless Steel Water Bottle", category: "fitness", price: 19.99, inStock: true, rating: 4.4 },
    { id: "P007", name: "LED Desk Lamp with USB Charging", category: "electronics", price: 39.99, inStock: true, rating: 4.3 },
    { id: "P008", name: "Natural Bamboo Cutting Board Set", category: "kitchen", price: 34.99, inStock: true, rating: 4.6 },
  ];

  let results = catalog.filter((p) =>
    p.name.toLowerCase().includes(query) ||
    p.category.includes(query)
  );

  if (category) {
    results = results.filter((p) => p.category === category);
  }
  if (maxPrice !== undefined && !isNaN(maxPrice)) {
    results = results.filter((p) => p.price <= maxPrice);
  }

  // If no direct matches, return fuzzy results
  if (results.length === 0) {
    const queryWords = query.split(/\s+/);
    results = catalog.filter((p) =>
      queryWords.some((w) => p.name.toLowerCase().includes(w) || p.category.includes(w))
    );
  }

  return {
    success: true,
    data: {
      query,
      totalResults: results.length,
      products: results.slice(0, 5).map((p) => ({
        ...p,
        stockStatus: p.inStock ? "In Stock" : "Out of Stock",
      })),
    },
    durationMs: Math.round(performance.now() - start),
  };
}

/**
 * book_appointment: Books a calendar appointment slot.
 * Risk: Medium — creates a new resource (side effect).
 */
async function bookAppointmentHandler(
  params: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const start = performance.now();
  const date = String(params.date || "").trim();
  const time = String(params.time || "").trim();
  const clientName = String(params.clientName || "").trim();
  const contact = String(params.contact || "").trim();
  const service = String(params.service || "General Consultation").trim();

  if (!date || !time || !clientName) {
    const missing: string[] = [];
    if (!date) missing.push("date");
    if (!time) missing.push("time");
    if (!clientName) missing.push("clientName");
    return {
      success: false,
      data: { missingFields: missing },
      error: `Missing required fields: ${missing.join(", ")}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // Simulate appointment booking
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));

  // Simple slot availability check (simulate some time slots as taken)
  const hour = parseInt(time.split(":")[0], 10);
  const isAvailable = hour >= 9 && hour <= 17 && hour !== 12; // 9AM-5PM, not noon

  if (!isAvailable) {
    return {
      success: false,
      data: {
        requestedDate: date,
        requestedTime: time,
        availableSlots: ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
      },
      error: `The ${time} slot on ${date} is not available. Please choose from the available slots.`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  const confirmationId = `APT-${Date.now().toString(36).toUpperCase()}`;

  return {
    success: true,
    data: {
      confirmationId,
      clientName,
      contact: contact || "Not provided",
      date,
      time,
      service,
      status: "confirmed",
      reminder: `A confirmation has been sent. Please arrive 10 minutes early.`,
    },
    durationMs: Math.round(performance.now() - start),
  };
}

/**
 * create_ticket: Creates a customer support ticket.
 * Risk: Medium — creates a new resource (side effect).
 */
async function createTicketHandler(
  params: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const start = performance.now();
  const subject = String(params.subject || "").trim();
  const description = String(params.description || "").trim();
  const priority = String(params.priority || "medium").toLowerCase();

  if (!subject) {
    return {
      success: false,
      data: {},
      error: "Ticket subject is required",
      durationMs: Math.round(performance.now() - start),
    };
  }

  // Simulate ticket creation
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 80));

  const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
  const validPriority = ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium";

  const responseTimeMap: Record<string, string> = {
    low: "48 hours",
    medium: "24 hours",
    high: "4 hours",
    urgent: "1 hour",
  };

  return {
    success: true,
    data: {
      ticketId,
      subject,
      description: description || "No description provided",
      priority: validPriority,
      status: "open",
      estimatedResponseTime: responseTimeMap[validPriority],
      assignedTeam: "Customer Support",
      createdAt: new Date().toISOString(),
    },
    durationMs: Math.round(performance.now() - start),
  };
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

/** Registry of all built-in tool handler functions */
const BUILT_IN_HANDLERS: Record<string, ToolHandler> = {
  check_order: checkOrderHandler,
  search_product: searchProductHandler,
  book_appointment: bookAppointmentHandler,
  create_ticket: createTicketHandler,
};

/** Default parameter definitions for built-in tools */
export const BUILT_IN_TOOL_DEFINITIONS: Record<
  string,
  {
    displayName: string;
    description: string;
    parameters: ToolParameterDef[];
    riskLevel: "low" | "medium" | "high";
  }
> = {
  check_order: {
    displayName: "Check Order Status",
    description:
      "Look up a customer order by its order ID. Returns the current status, carrier, tracking number, estimated delivery date, and order items.",
    parameters: [
      {
        name: "orderId",
        type: "string",
        description: "The unique order identifier to look up (e.g., ORD-12345)",
        required: true,
      },
    ],
    riskLevel: "low",
  },
  search_product: {
    displayName: "Search Products",
    description:
      "Search the product catalog by query string, optionally filtering by category and maximum price. Returns matching products with stock availability and ratings.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "The search query to find products (e.g., 'bluetooth earbuds')",
        required: true,
      },
      {
        name: "category",
        type: "string",
        description: "Optional product category filter",
        required: false,
        enum: ["electronics", "food", "furniture", "fitness", "kitchen"],
      },
      {
        name: "maxPrice",
        type: "number",
        description: "Optional maximum price filter in USD",
        required: false,
      },
    ],
    riskLevel: "low",
  },
  book_appointment: {
    displayName: "Book Appointment",
    description:
      "Schedule a new appointment for a client. Books a time slot on the specified date. Available hours are 9AM-5PM excluding noon.",
    parameters: [
      {
        name: "date",
        type: "string",
        description: "Appointment date in YYYY-MM-DD format (e.g., 2025-01-15)",
        required: true,
      },
      {
        name: "time",
        type: "string",
        description: "Appointment time in HH:MM format, 24-hour (e.g., 14:00 for 2PM)",
        required: true,
      },
      {
        name: "clientName",
        type: "string",
        description: "Full name of the client booking the appointment",
        required: true,
      },
      {
        name: "contact",
        type: "string",
        description: "Client phone number or email for confirmation",
        required: false,
      },
      {
        name: "service",
        type: "string",
        description: "Type of service or reason for the appointment",
        required: false,
      },
    ],
    riskLevel: "medium",
  },
  create_ticket: {
    displayName: "Create Support Ticket",
    description:
      "Create a new customer support ticket. Assigns to the support team with an estimated response time based on priority level.",
    parameters: [
      {
        name: "subject",
        type: "string",
        description: "Brief subject line describing the issue",
        required: true,
      },
      {
        name: "description",
        type: "string",
        description: "Detailed description of the customer's issue or request",
        required: false,
      },
      {
        name: "priority",
        type: "string",
        description: "Ticket priority level",
        required: false,
        enum: ["low", "medium", "high", "urgent"],
      },
    ],
    riskLevel: "medium",
  },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a tool name has a built-in handler.
 */
export function isBuiltInTool(name: string): boolean {
  return name in BUILT_IN_HANDLERS;
}

/**
 * Get the handler function for a tool. Returns undefined if not found.
 */
export function getToolHandler(name: string): ToolHandler | undefined {
  return BUILT_IN_HANDLERS[name];
}

/**
 * Execute a tool by name with validated parameters.
 * Enforces parameter validation and catches runtime errors.
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  toolDoc: IToolDocument,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const start = performance.now();

  // 1. Verify handler exists
  const handler = BUILT_IN_HANDLERS[toolName];
  if (!handler) {
    return {
      success: false,
      data: {},
      error: `Tool "${toolName}" has no registered handler`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // 2. Verify tool is enabled
  if (!toolDoc.enabled) {
    return {
      success: false,
      data: {},
      error: `Tool "${toolName}" is currently disabled`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // 3. Validate required parameters
  const missingRequired = toolDoc.parameters
    .filter((p) => p.required && (params[p.name] === undefined || params[p.name] === null || params[p.name] === ""))
    .map((p) => p.name);

  if (missingRequired.length > 0) {
    return {
      success: false,
      data: { missingFields: missingRequired },
      error: `Missing required parameters: ${missingRequired.join(", ")}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // 4. Sanitize parameters — only pass declared parameter names
  const sanitizedParams: Record<string, unknown> = {};
  for (const paramDef of toolDoc.parameters) {
    if (params[paramDef.name] !== undefined) {
      sanitizedParams[paramDef.name] = params[paramDef.name];
    } else if (paramDef.default !== undefined) {
      sanitizedParams[paramDef.name] = paramDef.default;
    }
  }

  // 5. Execute with error boundary
  try {
    const result = await handler(sanitizedParams, context);
    return result;
  } catch (err: any) {
    console.error(`[Tool Registry] Execution error for "${toolName}":`, err);
    return {
      success: false,
      data: {},
      error: `Tool execution failed: ${err.message || "Unknown error"}`,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

/**
 * Convert an array of Tool documents into OpenAI-compatible tool definitions
 * for the LLM function calling API.
 */
export function toolDocsToLLMDefinitions(tools: IToolDocument[]): LLMToolDefinition[] {
  return tools
    .filter((t) => t.enabled)
    .map((tool) => {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const param of tool.parameters) {
        const prop: any = {
          type: param.type === "array" ? "array" : param.type === "object" ? "object" : param.type,
          description: param.description,
        };
        if (param.enum) {
          prop.enum = param.enum;
        }
        if (param.default !== undefined) {
          prop.default = param.default;
        }
        properties[param.name] = prop;

        if (param.required) {
          required.push(param.name);
        }
      }

      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object" as const,
            properties,
            required,
          },
        },
      };
    });
}

/**
 * Get all built-in tool names.
 */
export function getBuiltInToolNames(): string[] {
  return Object.keys(BUILT_IN_HANDLERS);
}
