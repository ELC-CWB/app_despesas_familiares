// src/lib/talkie/tools.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TalkieMemoryRow } from './memory';
import { getPortfolioSummary } from '@/lib/investments/portfolio-summary';

export interface ToolCtx {
  supabase: SupabaseClient;
  userId: string;
  memRow: TalkieMemoryRow;
}

// ─── Tool schemas (Anthropic tool-use input_schema format) ────────────────────

const EXPENSES_TOOL = {
  name: 'get_expenses',
  description:
    "Get a summary of the family's real household expenses (housing, food, health, education, leisure, transport, etc.) from the shared expense tracker. Call this whenever the user asks about spending, budget, how much they spent, or a category breakdown — never guess or invent numbers; always call this tool for real financial data. Defaults to the current calendar month if no range is given.",
  input_schema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date YYYY-MM-DD, inclusive start of a custom range.' },
      end_date: { type: 'string', description: 'ISO date YYYY-MM-DD, inclusive end of a custom range.' },
      month: { type: 'integer', description: '1-12. Use with year instead of start_date/end_date for a billing-month view.' },
      year: { type: 'integer', description: 'e.g. 2026. Use with month.' },
      category: {
        type: 'string',
        enum: ['moradia', 'alimentacao', 'saude', 'educacao', 'lazer', 'transporte', 'outros'],
        description: 'Restrict to a single expense category.',
      },
    },
    required: [],
  },
};

const PORTFOLIO_TOOL = {
  name: 'get_investment_portfolio',
  description:
    "Get a summary of the user's stock/investment portfolio: total invested, current value, gains, dividend yield, and top positions. Call this whenever the user asks about their investments, stocks, portfolio performance, or dividends.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

const WEATHER_TOOL = {
  name: 'get_weather',
  description:
    "Get the weather forecast for a city. Call this when the user asks about the weather, temperature, rain, or whether to bring an umbrella. If no city argument is given, the user's configured default city is used; if neither is available the tool result will tell you to ask the user for their city instead of guessing.",
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name, e.g. "Curitiba" or "São Paulo". Omit to use the configured default.' },
      days: { type: 'integer', description: 'Number of forecast days, 1-7. Defaults to 3.' },
    },
    required: [],
  },
};

const HOLIDAYS_TOOL = {
  name: 'get_holidays',
  description:
    'Get the list of Brazilian national holidays for a given year. Call this when the user asks about upcoming holidays, a specific date, or how many holidays remain this year.',
  input_schema: {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'e.g. 2026. Defaults to the current year.' },
    },
    required: [],
  },
};

const PHASE_A_TOOLS = [EXPENSES_TOOL, PORTFOLIO_TOOL, WEATHER_TOOL, HOLIDAYS_TOOL];

// Phase B (Google Calendar) will extend this with calendar tools, gated on a
// `google_tokens` row existing for the user — not implemented yet.
export function buildToolsForUser() {
  return PHASE_A_TOOLS;
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function executeTool(name: string, input: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  switch (name) {
    case 'get_expenses':
      return getExpenses(ctx, input);
    case 'get_investment_portfolio':
      return getInvestmentPortfolio(ctx);
    case 'get_weather':
      return getWeather(ctx, input);
    case 'get_holidays':
      return getHolidays(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Handlers — each THROWS on failure; route.ts converts that into an is_error tool_result ──

const round2 = (n: number) => Math.round(n * 100) / 100;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function getExpenses(ctx: ToolCtx, input: Record<string, unknown>) {
  const now = new Date();
  let query = ctx.supabase
    .from('expenses')
    .select('date, payment_month, payment_year, payment_method, description, category, amount');

  if (input.month && input.year) {
    query = query.eq('payment_month', input.month).eq('payment_year', input.year);
  } else if (input.start_date && input.end_date) {
    query = query.gte('date', input.start_date as string).lte('date', input.end_date as string);
  } else {
    query = query.eq('payment_month', now.getMonth() + 1).eq('payment_year', now.getFullYear());
  }
  if (input.category) query = query.eq('category', input.category as string);

  const { data, error } = await query.limit(1000);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byCategory: Record<string, number> = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);

  const topItems = [...rows]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((r) => ({ description: r.description, amount: round2(Number(r.amount)), date: r.date, category: r.category }));

  return {
    filters: input,
    count: rows.length,
    total: round2(total),
    by_category: Object.entries(byCategory).map(([category, amount]) => ({ category, amount: round2(amount) })),
    top_items: topItems,
  };
}

async function getInvestmentPortfolio(ctx: ToolCtx) {
  const full = await withTimeout(
    getPortfolioSummary(ctx.supabase, ctx.userId),
    10000,
    'Investment data lookup timed out.'
  );
  return {
    is_read_only: full.isReadOnly,
    owner_name: full.ownerName,
    totals: {
      total_invested: round2(full.totals.totalInvested),
      current_value: round2(full.totals.currentValue),
      gain: round2(full.totals.gain),
      gain_percent: round2(full.totals.gainPercent),
      dividends_12m: round2(full.totals.totalDividends12m),
      total_return_percent: round2(full.totals.totalReturnPercent),
    },
    position_count: full.positions.length,
    top_positions: full.positions.slice(0, 5).map((p) => ({
      symbol: p.symbol,
      company_name: p.company_name,
      quantity: p.quantity,
      current_value: round2(p.currentValue),
      gain_percent: round2(p.gainPercent),
      dy_12m_percent: round2(p.dy12m),
    })),
  };
}

async function getWeather(ctx: ToolCtx, input: Record<string, unknown>) {
  const city = (input.city as string) || ctx.memRow.city;
  if (!city) {
    return { needs_city: true, message: 'No city configured or provided — ask the user which city to check.' };
  }
  const days = Math.min(Math.max(Number(input.days) || 3, 1), 7);

  const geoResp = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`
  );
  if (!geoResp.ok) throw new Error('Weather geocoding service unavailable.');
  const geo = await geoResp.json();
  const place = geo?.results?.[0];
  if (!place) return { not_found: true, message: `Could not find location "${city}".` };

  const fResp = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&forecast_days=${days}`
  );
  if (!fResp.ok) throw new Error('Weather forecast service unavailable.');
  const forecast = await fResp.json();

  return {
    city: place.name,
    days: forecast.daily.time.map((date: string, i: number) => ({
      date,
      temp_max_c: forecast.daily.temperature_2m_max[i],
      temp_min_c: forecast.daily.temperature_2m_min[i],
      precipitation_probability_percent: forecast.daily.precipitation_probability_max[i],
      weathercode: forecast.daily.weathercode[i],
    })),
  };
}

async function getHolidays(input: Record<string, unknown>) {
  const year = Number(input.year) || new Date().getFullYear();
  const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  if (!resp.ok) throw new Error('Holidays service unavailable.');
  const holidays = await resp.json();
  return { year, holidays };
}
