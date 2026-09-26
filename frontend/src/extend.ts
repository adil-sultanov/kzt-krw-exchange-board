import { t } from "./i18n";
import { choose } from "./telegram";
import { type DurationDays, type ExchangeRequest, extendOptions } from "./types";

/** Asks how long from now to keep `request` on the board; null if cancelled. */
export async function askExtendDays(request: ExchangeRequest): Promise<DurationDays | null> {
  const options = extendOptions(request);
  if (options.length === 0) return null;
  const choice = await choose(
    t.extend.question,
    options.map((days) => ({ id: String(days), text: t.extend.option(days) })),
  );
  return options.find((days) => String(days) === choice) ?? null;
}
